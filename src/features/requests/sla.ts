export type SlaStatus = 'pending' | 'dueToday' | 'overdue' | 'completedWithin' | 'completedLate';

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
