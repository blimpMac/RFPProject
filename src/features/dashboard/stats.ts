export type TimedRequest = {
  final_status: string;
  submitted_at: string;
  department_approval_at: string | null;
  finance_review_at: string | null;
};

const completedStatuses = new Set(['paid', 'check released']);
const returnedStatuses = new Set([
  'returned to requestor',
  'returned to department approver',
  // Keep historical records correctly classified during the transition.
  'department rejected',
  'finance rejected',
]);

export function calculateDashboardStats(requests: TimedRequest[]) {
  const approved = requests.filter((request) =>
    completedStatuses.has(request.final_status.toLowerCase()),
  ).length;
  const rejected = requests.filter((request) =>
    returnedStatuses.has(request.final_status.toLowerCase()),
  ).length;
  const pending = requests.length - approved - rejected;
  const durations = requests
    .flatMap((request) => {
      const end = request.finance_review_at || request.department_approval_at;
      return end
        ? [(new Date(end).getTime() - new Date(request.submitted_at).getTime()) / 36e5]
        : [];
    })
    .filter((hours) => hours >= 0);

  return {
    total: requests.length,
    approved,
    rejected,
    pending,
    avg: durations.length
      ? durations.reduce((total, hours) => total + hours, 0) / durations.length
      : 0,
  };
}
