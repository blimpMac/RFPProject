from pathlib import Path


def split_account_management_ui() -> None:
    settings = Path('src/pages/SettingsPage.tsx')
    text = settings.read_text()
    component_start = text.index('function AccountRow(')
    components = text[component_start:]
    components = components.replace('function AccountRow(', 'export function AccountRow(', 1)
    components = components.replace('function EmailForm(', 'export function EmailForm(', 1)
    components = components.replace('function AccountForm(', 'export function AccountForm(', 1)

    component_header = """import { useState } from 'react';
import { KeyRound, Mail, Trash2 } from 'lucide-react';
import type { AccessLevel, StaffUser } from '../../../shared/contracts/accounts';
import { Button, Modal, Spinner, StatusBadge } from '../../components/ui';
import { patch, post } from '../../lib/api';

const normalizeDepartment = (value: string | null | undefined) =>
  (value || '')
    .replace(/^[-–—\\s]+/, '')
    .trim()
    .toLowerCase();
const isFinance = (value: string | null | undefined) => normalizeDepartment(value) === 'finance';

"""
    Path('src/features/accounts/AccountManagementForms.tsx').write_text(
        component_header + components
    )

    page = text[:component_start].rstrip() + '\n'
    page = page.replace(
        "import { KeyRound, Mail, Search, Trash2, UserPlus } from 'lucide-react';",
        "import { Search, UserPlus } from 'lucide-react';",
    )
    page = page.replace(
        "import type { AccessLevel, StaffUser } from '../../shared/contracts/accounts';",
        "import type { StaffUser } from '../../shared/contracts/accounts';",
    )
    page = page.replace(
        "import { Button, Modal, Spinner, StatusBadge } from '../components/ui';",
        "import { Button, Spinner } from '../components/ui';",
    )
    page = page.replace(
        "import { del, patch, post } from '../lib/api';",
        "import { del, post } from '../lib/api';",
    )
    page = page.replace(
        "import { AccountPagination } from '../features/accounts/AccountPagination';",
        "import { AccountPagination } from '../features/accounts/AccountPagination';\n"
        "import { AccountForm, AccountRow, EmailForm } from '../features/accounts/AccountManagementForms';",
    )
    utility_start = page.index('const normalizeDepartment =')
    utility_end = page.index('\n\nexport function SettingsPage()')
    page = page[:utility_start] + page[utility_end + 2 :]
    settings.write_text(page)


def split_account_admin_routes() -> None:
    admin = Path('server/routes/administration.ts')
    text = admin.read_text()
    helper_start = text.index('async function refreshDepartmentReviewers')
    handler_start = text.index('export const handleAdministrationRoutes')
    helpers = text[helper_start:handler_start]
    account_start = text.index("  if (route === 'staff-users/reset-password') {")
    account_end = text.index("  if (route === 'settings') {")
    account_chunk = text[account_start:account_end]

    imports = """import { z } from 'zod';
import type { StaffUser } from '../../../shared/contracts/accounts.js';
import { isLegacyProtectedStaffEmail } from '../../domain/access.js';
import { flushEmailQueueForRequest } from '../../email/service.js';
import { requireStaff } from '../../lib/auth.js';
import { ensureMethod, HttpError, json, readJson } from '../../lib/http.js';
import { accessRole, normalizeDepartment } from '../../lib/staff-access.js';
import {
  assignDepartmentHead,
  clearDepartmentHeadAssignments,
  FINANCE_DEPARTMENT,
  resolveDepartmentHeadTarget,
} from '../../services/account-governance.js';
import { refreshPendingDepartmentReviews } from '../../services/workflow-notifications.js';
import type { RouteHandler } from '../context.js';

"""
    Path('server/routes/administration').mkdir(parents=True, exist_ok=True)
    Path('server/routes/administration/accounts.ts').write_text(
        imports
        + helpers
        + "export const handleAccountAdministrationRoutes: RouteHandler = async ({ event, route, db, config }) => {\n"
        + account_chunk
        + "\n  return undefined;\n};\n"
    )

    stripped = text[:helper_start] + text[handler_start:account_start] + text[account_end:]
    body = stripped[stripped.index('export const handleAdministrationRoutes') :]
    marker = "  if (route === 'settings') {"
    body = body.replace(
        marker,
        "  const accountResponse = await handleAccountAdministrationRoutes({ event, route, db, config });\n"
        "  if (accountResponse) return accountResponse;\n\n"
        + marker,
        1,
    )
    admin.write_text(
        """import { z } from 'zod';
import { administrativeRoles, protectedAccountLabel } from '../domain/access.js';
import { sendEmailPreview } from '../email/service.js';
import { emailTemplateKeys, renderEmailPreview } from '../email/templates.js';
import { requireStaff } from '../lib/auth.js';
import { HttpError, json, readJson } from '../lib/http.js';
import { getApprovingHeadOverview } from '../services/approving-heads.js';
import { handleAccountAdministrationRoutes } from './administration/accounts.js';
import type { RouteHandler } from './context.js';

"""
        + body
    )


def split_dashboard_route() -> None:
    staff = Path('server/routes/staff.ts')
    text = staff.read_text()
    dashboard_start = text.index("  if (route === 'dashboard') {")
    dashboard_end = text.index("  if (route.startsWith('digital-rfp/')) {")
    dashboard_chunk = text[dashboard_start:dashboard_end]

    Path('server/routes/staff').mkdir(parents=True, exist_ok=True)
    Path('server/routes/staff/dashboard.ts').write_text(
        """import { requireStaff } from '../../lib/auth.js';
import { ensureMethod, HttpError, json } from '../../lib/http.js';
import { isDepartmentOnly } from '../../lib/staff-access.js';
import { getAssignedDepartments } from '../../services/approving-heads.js';
import type { RouteHandler } from '../context.js';

export const handleDashboardRoute: RouteHandler = async ({ event, route, db }) => {
"""
        + dashboard_chunk
        + "\n  return undefined;\n};\n"
    )

    remaining = (
        text[:dashboard_start]
        + "  const dashboardResponse = await handleDashboardRoute(context);\n"
        + "  if (dashboardResponse) return dashboardResponse;\n\n"
        + text[dashboard_end:]
    )
    remaining = remaining.replace(
        "import type { RouteHandler } from './context.js';",
        "import { handleDashboardRoute } from './staff/dashboard.js';\n"
        "import type { RouteHandler } from './context.js';",
    )
    remaining = remaining.replace(
        "export const handleStaffRoutes: RouteHandler = async ({ event, route, db }) => {",
        "export const handleStaffRoutes: RouteHandler = async (context) => {\n"
        "  const { event, route, db } = context;",
    )
    staff.write_text(remaining)


def centralize_sla_logic() -> None:
    Path('src/features/requests').mkdir(parents=True, exist_ok=True)
    Path('src/features/requests/sla.ts').write_text(
        """export type SlaStatus =
  | 'pending'
  | 'dueToday'
  | 'overdue'
  | 'completedWithin'
  | 'completedLate';

export type SlaRequest = {
  final_status: string;
  required_payment_date: string;
  planned_check_date?: string | null;
  completed_at?: string | null;
};

export const manilaDay = (value: string | number | Date) =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Manila',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(value));

export const requestDeadline = (request: SlaRequest) =>
  request.planned_check_date || request.required_payment_date;

export function requestSlaStatus(request: SlaRequest, today: string): SlaStatus {
  const deadline = requestDeadline(request);
  if (/paid/i.test(request.final_status)) {
    const completedDay = request.completed_at ? manilaDay(request.completed_at) : today;
    return completedDay <= deadline ? 'completedWithin' : 'completedLate';
  }
  if (deadline < today) return 'overdue';
  if (deadline === today) return 'dueToday';
  return 'pending';
}

function dateKeyToUtc(value: string) {
  const [year, month, day] = value.split('-').map(Number);
  return Date.UTC(year, month - 1, day);
}

export function overdueDays(request: SlaRequest, now: string | number | Date = Date.now()) {
  const today = manilaDay(now);
  if (requestSlaStatus(request, today) !== 'overdue') return 0;
  return Math.max(
    1,
    Math.floor((dateKeyToUtc(today) - dateKeyToUtc(requestDeadline(request))) / 86400000),
  );
}

export function displayRequestStatus(
  request: SlaRequest,
  now: string | number | Date = Date.now(),
) {
  const days = overdueDays(request, now);
  if (!days) return request.final_status;
  return `${request.final_status} · Overdue by ${days} day${days === 1 ? '' : 's'}`;
}
"""
    )

    dashboard = Path('src/pages/DashboardPage.tsx')
    text = dashboard.read_text()
    text = text.replace(
        "import { calculateDashboardStats } from '../features/dashboard/stats';",
        "import { calculateDashboardStats } from '../features/dashboard/stats';\n"
        "import {\n"
        "  manilaDay,\n"
        "  requestDeadline,\n"
        "  requestSlaStatus,\n"
        "  type SlaStatus,\n"
        "} from '../features/requests/sla';",
    )
    sla_start = text.index('type SlaStatus =')
    sla_end = text.index('export function DashboardPage()')
    dashboard.write_text(text[:sla_start] + text[sla_end:])

    track = Path('src/pages/TrackPage.tsx')
    text = track.read_text()
    text = text.replace(
        "import { useAutoRefresh } from '../hooks/useAutoRefresh';",
        "import { useAutoRefresh } from '../hooks/useAutoRefresh';\n"
        "import { displayRequestStatus } from '../features/requests/sla';",
    )
    text = text.replace(
        "  const r = data!.request;\n  return (",
        "  const r = data!.request;\n"
        "  const displayedStatus = displayRequestStatus(r);\n"
        "  return (",
    )
    text = text.replace("            ['Status', r.final_status],", "            ['Status', displayedStatus],")
    track.write_text(text)


def write_architecture_guide() -> None:
    Path('docs/ARCHITECTURE.md').write_text(
        """# Application architecture

The RFP system uses a feature-oriented structure. New work should keep route files thin and move business rules into focused modules.

## Frontend

- `src/pages/` composes screens and owns page-level loading/navigation only.
- `src/features/<feature>/` contains feature components, hooks, calculations, and presentation helpers.
- `src/components/` contains shared UI used across features.
- `src/lib/` contains framework-agnostic client utilities.
- `shared/contracts/` contains server/client contracts.

Large page files should be split when a section has its own state, validation, or reusable behavior. Account-management forms now live under `src/features/accounts/` and SLA rules live under `src/features/requests/`.

## Backend

- `server/routes/` performs HTTP parsing, authentication, and delegation.
- Nested route modules such as `server/routes/administration/` and `server/routes/staff/` own one API area.
- `server/services/` owns workflow/business rules and reusable database operations.
- `server/lib/` owns validation, authentication, configuration, and low-level helpers.

A route should not duplicate approval or permission rules already available from a service. New workflow behavior belongs in a service first, then the route calls it.

## Workflow safety

- Only `super_administrator` is Finance Head.
- Finance actions are limited to Finance Members and Super Admin according to stage.
- Department Head changes must refresh/revoke pending review credentials.
- Stored workflow states remain authoritative. Derived presentation such as SLA/overdue labels must not overwrite workflow state.
- Protected operational accounts and the active Super Admin cannot be removed from Account Management.

## Refactoring rule

Prefer small, behavior-preserving extractions before feature changes. Run `npm run check` after every structural change. Avoid mixing a large workflow rewrite with a visual redesign in the same commit.
"""
    )


split_account_management_ui()
split_account_admin_routes()
split_dashboard_route()
centralize_sla_logic()
write_architecture_guide()
