export function reviewerIsCurrentDepartmentHead(input: {
  reviewerEmail: string;
  requestStatus: string;
  requestDepartment: string;
  profile?: { id: string; email?: string | null; active?: boolean } | null;
  roles?: string[];
  assignedDepartments?: string[];
}) {
  const email = input.reviewerEmail.trim().toLowerCase();
  return Boolean(
    input.requestStatus === 'Pending Department Approval' &&
    input.profile?.active &&
    input.profile.email?.trim().toLowerCase() === email &&
    input.roles?.includes('department_approver') &&
    input.assignedDepartments?.includes(input.requestDepartment),
  );
}
