import { z } from 'zod';
import { administrativeRoles } from '../../domain/access.js';
import { requireStaff } from '../../lib/auth.js';
import { ensureMethod, HttpError, json } from '../../lib/http.js';
import { isDepartmentOnly } from '../../lib/staff-access.js';
import { getAssignedDepartments } from '../../services/approving-heads.js';
import { auditTrailRow } from '../../services/audit-trail.js';
import type { RouteHandler } from '../context.js';

const tableMap: Record<string, { table: string; order: string; roles?: string[] }> = {
  requests: { table: 'rfp_requests', order: 'submitted_at' },
  forms: { table: 'form_responses', order: 'source_timestamp', roles: administrativeRoles },
  logs: { table: 'approval_logs', order: 'occurred_at' },
  flow: { table: 'process_flow_steps', order: 'display_order' },
  documents: {
    table: 'request_attachments',
    order: 'created_at',
    roles: [...administrativeRoles, 'finance_reviewer'],
  },
};

export const handleMonitoringRoutes: RouteHandler = async ({ event, route, db }) => {
  if (route === 'audit-trail') {
    ensureMethod(event, 'GET');
    await requireStaff(event, [...administrativeRoles, 'finance_reviewer']);
    const input = z
      .object({
        page: z.coerce.number().int().min(1).default(1),
        pageSize: z.coerce.number().int().min(25).max(200).default(50),
        table: z.string().max(80).optional(),
        operation: z.enum(['INSERT', 'UPDATE', 'DELETE']).optional(),
        from: z.iso.date().optional(),
        to: z.iso.date().optional(),
        export: z.enum(['true', 'false']).default('false'),
      })
      .parse(event.queryStringParameters || {});
    const exporting = input.export === 'true';
    const pageSize = exporting ? 10_000 : input.pageSize;
    const page = exporting ? 1 : input.page;
    let query = db
      .from('audit_logs')
      .select(
        'id,table_name,record_id,operation,actor_user_id,actor_email,old_values,new_values,occurred_at',
        { count: 'exact' },
      )
      .order('occurred_at', { ascending: false });
    if (input.table) query = query.eq('table_name', input.table);
    if (input.operation) query = query.eq('operation', input.operation);
    if (input.from) query = query.gte('occurred_at', `${input.from}T00:00:00+08:00`);
    if (input.to) query = query.lte('occurred_at', `${input.to}T23:59:59.999+08:00`);
    const result = await query.range((page - 1) * pageSize, page * pageSize - 1);
    if (result.error) throw result.error;
    return json(200, {
      ok: true,
      rows: ((result.data || []) as Record<string, unknown>[]).map(auditTrailRow),
      count: result.count || 0,
      page,
      pageSize,
      truncated: exporting && (result.count || 0) > pageSize,
    });
  }

  if (route.startsWith('monitoring/')) {
    ensureMethod(event, 'GET');
    const key = route.slice(11);
    const specification = tableMap[key];
    if (!specification) throw new HttpError(404, 'Worksheet not found.');
    const staff = await requireStaff(event, specification.roles);
    const page = Math.max(1, Number(event.queryStringParameters?.page) || 1);
    const pageSize = Math.min(
      200,
      Math.max(10, Number(event.queryStringParameters?.pageSize) || 50),
    );
    let query = db
      .from(specification.table)
      .select('*', { count: 'exact' })
      .order(specification.order, { ascending: false })
      .range((page - 1) * pageSize, page * pageSize - 1);
    if (key === 'requests' && isDepartmentOnly(staff.roles)) {
      const departments = await getAssignedDepartments(db, staff.user.id);
      if (!departments.length) {
        throw new HttpError(403, 'Your approver account has no department assignment.');
      }
      query = query.in('normalized_department', departments);
    }
    if (key === 'logs' && isDepartmentOnly(staff.roles)) {
      const departments = await getAssignedDepartments(db, staff.user.id);
      if (!departments.length) {
        throw new HttpError(403, 'Your approver account has no department assignment.');
      }
      const assigned = await db
        .from('rfp_requests')
        .select('id')
        .in('normalized_department', departments);
      const ids = (assigned.data || []).map((request) => request.id);
      query = ids.length
        ? query.in('request_id', ids)
        : query.eq('request_id', '00000000-0000-0000-0000-000000000000');
    }
    const result = await query;
    if (result.error) throw result.error;
    return json(200, {
      ok: true,
      rows: result.data || [],
      count: result.count,
      page,
      pageSize,
    });
  }

  if (route === 'documents') {
    ensureMethod(event, 'GET');
    await requireStaff(event, [...administrativeRoles, 'finance_reviewer']);
    const attachments = await db
      .from('request_attachments')
      .select('id,request_id,original_filename,mime_type,size_bytes,status,created_at')
      .order('created_at', { ascending: false })
      .limit(2000);
    if (attachments.error) throw attachments.error;
    const requestIds = [
      ...new Set((attachments.data || []).map((attachment) => attachment.request_id)),
    ];
    const requests = requestIds.length
      ? await db
          .from('rfp_requests')
          .select(
            'id,rfp_number,requestor_name,requestor_email,company,department,supplier_payee,amount,required_payment_date,final_status,last_action,submitted_at',
          )
          .in('id', requestIds)
      : { data: [], error: null };
    if (requests.error) throw requests.error;
    const requestMap = new Map((requests.data || []).map((request) => [request.id, request]));
    const rows = (attachments.data || []).map((attachment) => {
      const request = requestMap.get(attachment.request_id);
      return {
        ...attachment,
        rfp_number: request?.rfp_number || 'Unknown RFP',
        requestor_name: request?.requestor_name || 'Unknown requestor',
        requestor_email: request?.requestor_email || '',
        company: request?.company || '',
        department: request?.department || '',
        supplier_payee: request?.supplier_payee || '',
        amount: request?.amount || 0,
        required_payment_date: request?.required_payment_date || null,
        final_status: request?.final_status || 'Unknown',
        last_action: request?.last_action || '',
        request_date: request?.submitted_at || attachment.created_at,
      };
    });
    return json(200, { ok: true, rows });
  }

  return undefined;
};
