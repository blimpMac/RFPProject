import { z } from 'zod';
import { administrativeRoles } from '../domain/access.js';
import { flushEmailQueueForRequest } from '../email/service.js';
import { requireStaff } from '../lib/auth.js';
import { ensureMethod, HttpError, json, readJson } from '../lib/http.js';
import { isDepartmentOnly, normalizeDepartment } from '../lib/staff-access.js';
import { departmentRereviewSchema, financeSchema, financeUpdateSchema } from '../lib/validation.js';
import { getAssignedDepartments } from '../services/approving-heads.js';
import { cancelPendingDepartmentReview } from '../services/workflow-notifications.js';
import { auditTrailRow } from '../services/audit-trail.js';
import {
  isFinanceStageAction,
  performFinanceStageAction,
} from '../services/finance-stage-workflow.js';
import type { RouteHandler } from './context.js';

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

export const handleStaffRoutes: RouteHandler = async ({ event, route, db }) => {
  if (route === 'me') {
    ensureMethod(event, 'GET');
    const staff = await requireStaff(event);
    return json(200, {
      ok: true,
      user: { id: staff.user.id, email: staff.user.email },
      roles: staff.roles,
      profile: staff.profile,
    });
  }

  if (route === 'dashboard') {
    ensureMethod(event, 'GET');
    const staff = await requireStaff(event);
    let requestQuery = db
      .from('rfp_requests')
      .select(
        'id,rfp_number,submitted_at,company,department,amount,final_status,department_approval_at,finance_review_at,required_payment_date,planned_check_date,updated_at',
      )
      .not('submitted_at', 'is', null)
      .order('submitted_at', { ascending: false })
      .limit(5000);
    const departmentOnly = isDepartmentOnly(staff.roles);
    if (departmentOnly) {
      const departments = await getAssignedDepartments(db, staff.user.id);
      if (!departments.length) {
        throw new HttpError(403, 'Your approver account has no department assignment.');
      }
      requestQuery = requestQuery.in('normalized_department', departments);
    }
    const [metrics, requests] = await Promise.all([
      db.from('dashboard_metrics').select('*').single(),
      requestQuery,
    ]);
    if (metrics.error) throw metrics.error;
    if (requests.error) throw requests.error;
    const requestIds = (requests.data || []).map((request) => request.id);
    const requestIdSet = new Set(requestIds);
    const completionLogs = await db
      .from('approval_logs')
      .select('request_id,occurred_at')
      .eq('action', 'Payment Completed')
      .order('occurred_at', { ascending: false })
      .limit(5000);
    if (completionLogs.error) throw completionLogs.error;
    const completedAtByRequest = new Map<string, string>();
    for (const log of completionLogs.data || []) {
      if (
        log.request_id &&
        requestIdSet.has(log.request_id) &&
        !completedAtByRequest.has(log.request_id)
      ) {
        completedAtByRequest.set(log.request_id, log.occurred_at);
      }
    }
    const dashboardRequests = (requests.data || []).map((request) => ({
      ...request,
      completed_at:
        completedAtByRequest.get(request.id) ||
        (/paid/i.test(request.final_status) ? request.updated_at : null),
    }));
    let logsQuery = db
      .from('approval_logs')
      .select('*')
      .order('occurred_at', { ascending: false })
      .limit(8);
    if (departmentOnly) {
      logsQuery = requestIds.length
        ? logsQuery.in('request_id', requestIds)
        : logsQuery.eq('request_id', '00000000-0000-0000-0000-000000000000');
    }
    const logs = await logsQuery;
    return json(200, {
      ok: true,
      metrics: metrics.data,
      requests: dashboardRequests,
      recentActivity: logs.data || [],
    });
  }

  if (route.startsWith('digital-rfp/')) {
    ensureMethod(event, 'GET');
    await requireStaff(event, [...administrativeRoles, 'finance_reviewer']);
    const requestId = z.uuid().parse(route.slice('digital-rfp/'.length));
    const [request, attachments] = await Promise.all([
      db.from('rfp_requests').select('*').eq('id', requestId).single(),
      db
        .from('request_attachments')
        .select('id,original_filename,status')
        .eq('request_id', requestId)
        .eq('status', 'available')
        .order('created_at'),
    ]);
    if (request.error || !request.data) throw new HttpError(404, 'Request not found.');
    if (attachments.error) throw attachments.error;
    return json(200, { ok: true, request: request.data, attachments: attachments.data || [] });
  }

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

  if (route === 'finance/action') {
    ensureMethod(event, 'POST');
    const staff = await requireStaff(event, [...administrativeRoles, 'finance_reviewer']);
    const input = financeSchema.parse(readJson(event));
    const normalizedAction =
      input.action === 'approve'
        ? 'member_approve'
        : input.action === 'reject'
          ? 'member_reject'
          : input.action;

    if (isFinanceStageAction(normalizedAction)) {
      const request = await performFinanceStageAction(
        db,
        {
          requestId: input.requestId,
          action: normalizedAction,
          remarks: input.remarks,
        },
        {
          email: staff.user.email || '',
          userId: staff.user.id,
          roles: staff.roles,
        },
      );
      const delivery = await flushEmailQueueForRequest(input.requestId);
      return json(200, { ok: true, request, delivery });
    }

    const result = await db.rpc('finance_workflow_action', {
      p_request_id: input.requestId,
      p_action: input.action,
      p_remarks: input.remarks,
      p_actor_email: staff.user.email,
      p_actor_user_id: staff.user.id,
      p_planned_check_date: input.plannedCheckDate || null,
      p_change_reason: input.changeReason || null,
    });
    if (result.error) throw new HttpError(409, result.error.message);
    const delivery = await flushEmailQueueForRequest(input.requestId);
    return json(200, { ok: true, request: result.data, delivery });
  }

  if (route === 'finance/update') {
    ensureMethod(event, 'POST');
    const staff = await requireStaff(event, [...administrativeRoles, 'finance_reviewer']);
    const input = financeUpdateSchema.parse(readJson(event));
    const current = await db.from('rfp_requests').select('*').eq('id', input.requestId).single();
    if (current.error || !current.data) throw new HttpError(404, 'Request not found.');

    const request = current.data as Record<string, unknown>;
    const existingRaw =
      request.raw_record &&
      typeof request.raw_record === 'object' &&
      !Array.isArray(request.raw_record)
        ? (request.raw_record as Record<string, unknown>)
        : {};
    const existingOperations =
      existingRaw.finance_operations &&
      typeof existingRaw.finance_operations === 'object' &&
      !Array.isArray(existingRaw.finance_operations)
        ? (existingRaw.finance_operations as Record<string, unknown>)
        : {};
    const operations = {
      ...existingOperations,
      originals_received_date: input.originalsReceivedDate || null,
      document_verification: input.documentVerification || null,
      verification_remarks: input.verificationRemarks || null,
      updated_at: new Date().toISOString(),
      updated_by: staff.user.email,
    };
    if (operations.document_verification === 'Complete' && !operations.originals_received_date) {
      throw new HttpError(
        400,
        'Record the original documents received date before marking them complete.',
      );
    }
    if (
      operations.document_verification === 'Incomplete' &&
      !String(operations.verification_remarks || '').trim()
    ) {
      throw new HttpError(400, 'Describe the missing or incomplete documents.');
    }
    const previousDate = request.planned_check_date ? String(request.planned_check_date) : null;
    const nextDate = input.plannedCheckDate || null;
    if (previousDate && nextDate !== previousDate && !input.changeReason) {
      throw new HttpError(400, 'Add a reason for changing the planned release date.');
    }

    const version = Number(request.version || 1);
    const updated = await db
      .from('rfp_requests')
      .update({
        raw_record: { ...existingRaw, finance_operations: operations },
        finance_remarks: input.financeRemarks || null,
        planned_check_date: nextDate,
        check_date_last_updated:
          nextDate !== previousDate ? new Date().toISOString() : request.check_date_last_updated,
        check_date_change_reason:
          nextDate !== previousDate ? input.changeReason || null : request.check_date_change_reason,
        version: version + 1,
      })
      .eq('id', input.requestId)
      .eq('version', version)
      .select('*')
      .single();
    if (updated.error || !updated.data) {
      throw new HttpError(
        409,
        updated.error?.message || 'This request changed. Refresh and try again.',
      );
    }
    const log = await db.from('approval_logs').insert({
      request_id: input.requestId,
      rfp_number: String(request.rfp_number),
      action: 'Finance Records Updated',
      actor_email: staff.user.email,
      actor_user_id: staff.user.id,
      remarks: input.financeRemarks || input.verificationRemarks || input.changeReason || null,
      previous_status: String(request.final_status),
      new_status: String(request.final_status),
    });
    if (log.error) throw log.error;
    return json(200, { ok: true, request: updated.data });
  }

  if (route === 'department/action') {
    ensureMethod(event, 'POST');
    const staff = await requireStaff(event, [...administrativeRoles, 'department_approver']);
    const input = departmentRereviewSchema.parse(readJson(event));
    const request = await db
      .from('rfp_requests')
      .select('department,final_status')
      .eq('id', input.requestId)
      .single();
    if (request.error || !request.data) throw new HttpError(404, 'Request not found.');
    const isAdministrator = staff.roles.some((role) => administrativeRoles.includes(role));
    if (!isAdministrator) {
      const assignment = await db
        .from('department_approving_heads')
        .select('id')
        .eq('normalized_department', normalizeDepartment(request.data.department))
        .eq('user_id', staff.user.id)
        .maybeSingle();
      if (assignment.error || !assignment.data) {
        throw new HttpError(403, 'You are not assigned as an approving head for this department.');
      }
    }
    const procedure =
      request.data.final_status === 'Pending Department Approval'
        ? 'decide_department_request'
        : request.data.final_status === 'Returned to Department Approver'
          ? 'department_rereview_action'
          : null;
    if (!procedure) {
      throw new HttpError(409, 'This request is not awaiting a department decision.');
    }
    const result = await db.rpc(procedure, {
      p_request_id: input.requestId,
      p_decision: input.decision,
      p_remarks: input.remarks,
      p_actor_email: staff.user.email,
      p_actor_user_id: staff.user.id,
    });
    if (result.error) throw new HttpError(409, result.error.message);
    await cancelPendingDepartmentReview(db, input.requestId);
    const delivery = await flushEmailQueueForRequest(input.requestId);
    return json(200, { ok: true, request: result.data, delivery });
  }

  if (route === 'request-attachments') {
    ensureMethod(event, 'GET');
    const staff = await requireStaff(event);
    const requestId = z.uuid().parse(event.queryStringParameters?.requestId);
    const request = await db
      .from('rfp_requests')
      .select('normalized_department')
      .eq('id', requestId)
      .single();
    if (request.error || !request.data) throw new HttpError(404, 'Request not found.');
    if (isDepartmentOnly(staff.roles)) {
      const departments = await getAssignedDepartments(db, staff.user.id);
      if (!departments.includes(request.data.normalized_department)) {
        throw new HttpError(403, 'This request belongs to a department you are not assigned to.');
      }
    }
    const attachments = await db
      .from('request_attachments')
      .select('id,original_filename,mime_type,storage_path')
      .eq('request_id', requestId)
      .eq('status', 'available')
      .order('created_at');
    if (attachments.error) throw attachments.error;
    const previews = await Promise.all(
      (attachments.data || []).map(async (item) => {
        if (!item.storage_path) {
          return {
            id: item.id,
            original_filename: item.original_filename,
            mime_type: item.mime_type,
            url: null,
            download_url: null,
          };
        }
        const [preview, download] = await Promise.all([
          db.storage.from('rfp-attachments').createSignedUrl(item.storage_path, 900),
          db.storage
            .from('rfp-attachments')
            .createSignedUrl(item.storage_path, 900, { download: item.original_filename }),
        ]);
        if (preview.error) throw preview.error;
        if (download.error) throw download.error;
        return {
          id: item.id,
          original_filename: item.original_filename,
          mime_type: item.mime_type,
          url: preview.data.signedUrl,
          download_url: download.data.signedUrl,
        };
      }),
    );
    return json(200, { ok: true, attachments: previews });
  }

  if (route !== 'attachments/url') return undefined;

  ensureMethod(event, 'POST');
  const staff = await requireStaff(event);
  const input = z.object({ attachmentId: z.uuid() }).parse(readJson(event));
  const item = await db
    .from('request_attachments')
    .select('storage_path,request_id')
    .eq('id', input.attachmentId)
    .eq('status', 'available')
    .single();
  if (!item.data?.storage_path) throw new HttpError(404, 'Document not found.');
  if (isDepartmentOnly(staff.roles)) {
    const request = await db
      .from('rfp_requests')
      .select('normalized_department')
      .eq('id', item.data.request_id)
      .single();
    const departments = await getAssignedDepartments(db, staff.user.id);
    if (
      request.error ||
      !request.data ||
      !departments.includes(request.data.normalized_department)
    ) {
      throw new HttpError(403, 'This document belongs to a department you are not assigned to.');
    }
  }
  const signed = await db.storage
    .from('rfp-attachments')
    .createSignedUrl(item.data.storage_path, 300);
  if (signed.error) throw signed.error;
  return json(200, { ok: true, url: signed.data.signedUrl });
};
