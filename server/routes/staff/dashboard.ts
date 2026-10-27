import { requireStaff } from '../../lib/auth.js';
import { ensureMethod, HttpError, json } from '../../lib/http.js';
import { isDepartmentOnly } from '../../lib/staff-access.js';
import { getAssignedDepartments } from '../../services/approving-heads.js';
import type { RouteHandler } from '../context.js';

export const handleDashboardRoute: RouteHandler = async ({ event, route, db }) => {
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

  return undefined;
};
