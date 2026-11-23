import { z } from 'zod';
import { administrativeRoles, financeRoles } from '../../domain/access.js';
import { requireStaff } from '../../lib/auth.js';
import { ensureMethod, HttpError, json } from '../../lib/http.js';
import { isDepartmentOnly, normalizeDepartment } from '../../lib/staff-access.js';
import { getAssignedDepartments } from '../../services/approving-heads.js';
import { auditTrailRow } from '../../services/audit-trail.js';
import {
  addManilaBusinessDays,
  isWithinManilaBusinessDaySla,
  manilaBusinessDaysElapsed,
} from '../../../shared/utils/finance-review-sla.js';
import type { RouteHandler } from '../context.js';

const tableMap: Record<string, { table: string; order: string; roles?: string[] }> = {
  requests: { table: 'rfp_requests', order: 'submitted_at' },
  forms: { table: 'form_responses', order: 'source_timestamp', roles: administrativeRoles },
  logs: { table: 'approval_logs', order: 'occurred_at' },
  flow: { table: 'process_flow_steps', order: 'display_order' },
  documents: {
    table: 'request_attachments',
    order: 'created_at',
    roles: financeRoles,
  },
};

export const handleMonitoringRoutes: RouteHandler = async ({ event, route, db }) => {
  if (route === 'audit-trail') {
    ensureMethod(event, 'GET');
    await requireStaff(event, ['it_administrator']);
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

  if (route === 'monitoring/finance-sla') {
    ensureMethod(event, 'GET');
    await requireStaff(event, financeRoles);

    const settings = await db
      .from('system_settings')
      .select('value')
      .eq('key', 'workflow_targets')
      .maybeSingle();
    if (settings.error) throw settings.error;
    const targets =
      settings.data?.value &&
      typeof settings.data.value === 'object' &&
      !Array.isArray(settings.data.value)
        ? (settings.data.value as Record<string, unknown>)
        : {};
    const configuredTarget = Number(targets.financeReviewDays);
    const targetBusinessDays =
      Number.isFinite(configuredTarget) && configuredTarget >= 0
        ? Math.min(30, Math.floor(configuredTarget))
        : 2;

    type FinanceSlaLog = {
      id: string;
      request_id: string | null;
      rfp_number: string;
      occurred_at: string;
      action: string;
      actor_email: string | null;
      actor_user_id: string | null;
    };
    const logs: FinanceSlaLog[] = [];
    const batchSize = 1000;
    for (let offset = 0; ; offset += batchSize) {
      const result = await db
        .from('approval_logs')
        .select('id,request_id,rfp_number,occurred_at,action,actor_email,actor_user_id')
        .in('action', [
          'Department Approved',
          'Department Re-approved',
          'Finance Member Approved',
        ])
        .order('occurred_at', { ascending: true })
        .order('id', { ascending: true })
        .range(offset, offset + batchSize - 1);
      if (result.error) throw result.error;
      const batch = (result.data || []) as FinanceSlaLog[];
      logs.push(...batch);
      if (batch.length < batchSize) break;
    }

    const approvalLogs = logs.filter((log) => log.action === 'Finance Member Approved');
    const requestIds = [
      ...new Set(approvalLogs.map((log) => log.request_id).filter(Boolean) as string[]),
    ];
    const actorIds = [
      ...new Set(approvalLogs.map((log) => log.actor_user_id).filter(Boolean) as string[]),
    ];

    const requestRows: { id: string; department_approval_at: string | null }[] = [];
    for (let offset = 0; offset < requestIds.length; offset += 500) {
      const result = await db
        .from('rfp_requests')
        .select('id,department_approval_at')
        .in('id', requestIds.slice(offset, offset + 500));
      if (result.error) throw result.error;
      requestRows.push(...((result.data || []) as typeof requestRows));
    }

    const profileRows: { id: string; full_name: string | null; email: string }[] = [];
    for (let offset = 0; offset < actorIds.length; offset += 500) {
      const result = await db
        .from('profiles')
        .select('id,full_name,email')
        .in('id', actorIds.slice(offset, offset + 500));
      if (result.error) throw result.error;
      profileRows.push(...((result.data || []) as typeof profileRows));
    }

    const requestById = new Map(requestRows.map((request) => [request.id, request]));
    const profileById = new Map(profileRows.map((profile) => [profile.id, profile]));
    const handoffsByRequest = new Map<string, string[]>();
    for (const log of logs) {
      if (
        !log.request_id ||
        !['Department Approved', 'Department Re-approved'].includes(log.action)
      ) {
        continue;
      }
      const handoffs = handoffsByRequest.get(log.request_id) || [];
      handoffs.push(log.occurred_at);
      handoffsByRequest.set(log.request_id, handoffs);
    }

    const rows = approvalLogs
      .map((log) => {
        const approvedAt = new Date(log.occurred_at).getTime();
        const handoffs = handoffsByRequest.get(log.request_id || '') || [];
        let receivedAt: string | null = null;
        for (const handoff of handoffs) {
          if (new Date(handoff).getTime() <= approvedAt) receivedAt = handoff;
          else break;
        }
        const fallbackHandoff = requestById.get(log.request_id || '')?.department_approval_at;
        if (
          !receivedAt &&
          fallbackHandoff &&
          new Date(fallbackHandoff).getTime() <= approvedAt
        ) {
          receivedAt = fallbackHandoff;
        }

        const profile = log.actor_user_id ? profileById.get(log.actor_user_id) : undefined;
        const employeeEmail = profile?.email || log.actor_email || '';
        const employeeName =
          profile?.full_name?.trim() || employeeEmail || 'Unknown Finance employee';
        const deadlineAt = receivedAt
          ? addManilaBusinessDays(receivedAt, targetBusinessDays)
          : null;
        const status = !receivedAt
          ? 'unmeasurable'
          : isWithinManilaBusinessDaySla(receivedAt, log.occurred_at, targetBusinessDays)
            ? 'within'
            : 'outside';

        return {
          approvalId: log.id,
          requestId: log.request_id,
          rfpNumber: log.rfp_number,
          employeeId: log.actor_user_id,
          employeeName,
          employeeEmail,
          receivedAt,
          approvedAt: log.occurred_at,
          deadlineAt,
          elapsedBusinessDays: receivedAt
            ? manilaBusinessDaysElapsed(receivedAt, log.occurred_at)
            : null,
          status,
        };
      })
      .sort(
        (left, right) =>
          new Date(right.approvedAt).getTime() - new Date(left.approvedAt).getTime(),
      );

    return json(200, {
      ok: true,
      rows,
      count: rows.length,
      targetBusinessDays,
      unmeasurableCount: rows.filter((row) => row.status === 'unmeasurable').length,
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
    await requireStaff(event, financeRoles);
    const [attachments, requests, submissionOptions] = await Promise.all([
      db
        .from('request_attachments')
        .select('id,request_id,original_filename,mime_type,size_bytes,status,created_at')
        .order('created_at', { ascending: false })
        .limit(2000),
      db
        .from('rfp_requests')
        .select(
          'id,rfp_number,requestor_name,requestor_email,company,department,supplier_payee,amount,required_payment_date,final_status,last_action,submitted_at',
        )
        .not('submitted_at', 'is', null)
        .order('submitted_at', { ascending: false })
        .limit(5000),
      db.from('system_settings').select('value').eq('key', 'submission_options').maybeSingle(),
    ]);
    if (attachments.error) throw attachments.error;
    if (requests.error) throw requests.error;
    if (submissionOptions.error) throw submissionOptions.error;

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

    const configuredDepartments = Array.isArray(
      (submissionOptions.data?.value as { departments?: unknown } | null)?.departments,
    )
      ? (submissionOptions.data?.value as { departments: unknown[] }).departments.filter(
          (department): department is string =>
            typeof department === 'string' && Boolean(department.trim()),
        )
      : [];
    const departmentLabels = new Map<string, string>();
    for (const department of [
      ...configuredDepartments,
      ...(requests.data || []).map((request) => request.department),
    ]) {
      const label = String(department || '').trim();
      if (!label) continue;
      departmentLabels.set(normalizeDepartment(label), label);
    }
    const requestors = new Map<string, string>();
    for (const request of requests.data || []) {
      const email = String(request.requestor_email || '')
        .trim()
        .toLowerCase();
      if (!email) continue;
      requestors.set(email, String(request.requestor_name || email).trim() || email);
    }
    const companies = [
      ...new Set(
        (requests.data || [])
          .map((request) => String(request.company || '').trim())
          .filter(Boolean),
      ),
    ].sort((a, b) => a.localeCompare(b));
    const statuses = [
      ...new Set(
        (requests.data || [])
          .map((request) => String(request.final_status || '').trim())
          .filter(Boolean),
      ),
    ].sort((a, b) => a.localeCompare(b));

    return json(200, {
      ok: true,
      rows,
      filters: {
        companies,
        departments: [...departmentLabels.values()].sort((a, b) => a.localeCompare(b)),
        statuses,
        requestors: [...requestors.entries()]
          .map(([value, label]) => ({ value, label }))
          .sort((a, b) => a.label.localeCompare(b.label)),
      },
    });
  }

  return undefined;
};
