import { requireStaff } from '../lib/auth.js';
import { ensureMethod, json } from '../lib/http.js';
import { handleAttachmentRoutes } from './staff/attachments.js';
import { handleDashboardRoute } from './staff/dashboard.js';
import { handleDepartmentRoutes } from './staff/department.js';
import { handleFinanceRoutes } from './staff/finance.js';
import { handleMonitoringRoutes } from './staff/monitoring.js';
import { handleProfileRoutes } from './staff/profile.js';
import type { RouteHandler } from './context.js';

const staffRouteHandlers: RouteHandler[] = [
  handleDashboardRoute,
  handleProfileRoutes,
  handleAttachmentRoutes,
  handleMonitoringRoutes,
  handleFinanceRoutes,
  handleDepartmentRoutes,
];

export const handleStaffRoutes: RouteHandler = async (context) => {
  const { event, route } = context;
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

  for (const handler of staffRouteHandlers) {
    const response = await handler(context);
    if (response) return response;
  }
  return undefined;
};
