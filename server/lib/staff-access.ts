export type AccessLevel = 'staff' | 'approver';

export const accessRole = (level: AccessLevel) =>
  level === 'approver' ? 'department_approver' : 'finance_reviewer';

export const normalizeDepartment = (value: string | null | undefined) =>
  String(value ?? '')
    .replace(/^[-\u2013\u2014\s]+/, '')
    .trim()
    .toLowerCase();

export const isDepartmentOnly = (roles: string[]) =>
  roles.includes('department_approver') &&
  !roles.some((role) => ['super_administrator', 'finance_reviewer'].includes(role));

export const canAccessFinance = (roles: string[]) =>
  roles.some((role) => ['super_administrator', 'finance_reviewer'].includes(role));

export const canPerformFinanceStageAction = (action: string, roles: string[]) => {
  if (!roles.includes('finance_reviewer') || roles.includes('super_administrator')) return false;
  return [
    'member_approve',
    'member_reject',
    'request_documents',
    'hard_copy_approve',
    'send_check_approval',
    'check_releasing',
    'check_released',
    'liquidation_approve',
    'liquidation_return',
  ].includes(action);
};

export const canAccessDepartment = (
  staffDepartment: string | null | undefined,
  requestDepartment: string | null | undefined,
) =>
  Boolean(normalizeDepartment(staffDepartment)) &&
  normalizeDepartment(staffDepartment) === normalizeDepartment(requestDepartment);

