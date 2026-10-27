import { administrativeRoles, departmentDecisionRoles } from '../../domain/access.js';
import { flushEmailQueueForRequest } from '../../email/service.js';
import { requireStaff } from '../../lib/auth.js';
import { ensureMethod, HttpError, json, readJson } from '../../lib/http.js';
import { normalizeDepartment } from '../../lib/staff-access.js';
import { departmentRereviewSchema } from '../../lib/validation.js';
import { cancelPendingDepartmentReview } from '../../services/workflow-notifications.js';
import type { RouteHandler } from '../context.js';

export const handleDepartmentRoutes: RouteHandler = async ({ event, route, db }) => {
  if (route === 'department/action') {
    ensureMethod(event, 'POST');
    const staff = await requireStaff(event, departmentDecisionRoles);
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

  return undefined;
};
