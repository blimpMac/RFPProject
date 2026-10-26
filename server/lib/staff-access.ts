export type AccessLevel = 'staff' | 'finance_head' | 'approver';

export const accessRole = (level: AccessLevel) => {
  if (level === 'approver') return 'department_approver';
  if (level === 'finance_head') return 'finance_head';
  return 'finance_reviewer';
};

export const normalizeDepartment = (value: string | null | undefined) =>
  String(value ?? '')
    .replace(/^[-\u2013\u2014\s]+/, '')
    .trim()
    .toLowerCase();

export const isDepartmentOnly = (roles: string[]) =>
  roles.includes('department_approver') &&
  !roles.some((role) =>
    ['super_administrator', 'administrator', 'finance_head', 'finance_reviewer'].includes(role),
  );

export const canAccessDepartment = (
  staffDepartment: string | null | undefined,
  requestDepartment: string | null | undefined,
) =>
  Boolean(normalizeDepartment(staffDepartment)) &&
  normalizeDepartment(staffDepartment) === normalizeDepartment(requestDepartment);
