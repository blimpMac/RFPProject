export const administrativeRoles: string[] = ['super_administrator', 'administrator'];
export const financeRoles: string[] = ['super_administrator', 'finance_reviewer'];
export const departmentDecisionRoles: string[] = [...administrativeRoles, 'department_approver'];

const legacyProtectedStaffEmails = new Set([
  'gpigemcorqbbackup@gmail.com',
  'dricianfranciscordon@gmail.com',
]);

export function isLegacyProtectedStaffEmail(email: string | null | undefined) {
  return legacyProtectedStaffEmails.has(email?.toLowerCase() || '');
}

export function protectedAccountLabel(email: string | undefined) {
  return email ? 'Signed-in staff inbox' : 'Staff inbox';
}
