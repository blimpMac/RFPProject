import { manilaDate } from '../../lib/format';
import type { RfpRequest } from '../../types';
import { manilaDay } from '../requests/sla';

export type Action = { value: string; label: string };
export type QueueFocus = 'all' | 'member' | 'head' | 'hardcopy' | 'processing';
export type SlaInfo = {
  label: string;
  detail: string;
  tone: 'neutral' | 'good' | 'warning' | 'danger';
};
export type FinanceOperations = NonNullable<
  NonNullable<RfpRequest['raw_record']>['finance_operations']
>;

const dayNumber = (day: string) => Date.parse(`${day}T00:00:00Z`) / 864e5;

export { manilaDay };

export const financeOperations = (request: RfpRequest): FinanceOperations =>
  request.raw_record?.finance_operations || {};

export const requiresOriginals = (request: RfpRequest) => {
  void request;
  return true;
};

export const financeWorkflow = (request: RfpRequest) => request.raw_record?.finance_workflow || {};

export const processingOverdue = (request: RfpRequest, now: number) => {
  const dueAt = financeWorkflow(request).processing_due_at;
  return Boolean(
    dueAt &&
    new Date(dueAt).getTime() < now &&
    !/paid|returned to requestor/i.test(request.final_status),
  );
};

export const displayStatus = (request: RfpRequest, now: number) =>
  processingOverdue(request, now) ? 'Overdue' : request.final_status;

function elapsedDays(value: string | null, now: number) {
  if (!value) return 0;
  return Math.max(0, dayNumber(manilaDay(now)) - dayNumber(manilaDay(value)));
}

export function getSlaInfo(request: RfpRequest, now: number): SlaInfo {
  const status = request.final_status;
  const processingDue = financeWorkflow(request).processing_due_at;
  if (processingDue && !/paid|returned to requestor/i.test(status)) {
    const difference = new Date(processingDue).getTime() - now;
    if (difference < 0) {
      const overdueHours = Math.max(1, Math.ceil(Math.abs(difference) / 36e5));
      return {
        label: `${overdueHours}h overdue`,
        detail: `3-day processing deadline was ${manilaDate(processingDue, true)}`,
        tone: 'danger',
      };
    }
    const hours = Math.max(1, Math.ceil(difference / 36e5));
    return {
      label: `${hours}h left in 3-day process`,
      detail: `Processing deadline ${manilaDate(processingDue, true)}`,
      tone: hours <= 24 ? 'warning' : 'good',
    };
  }
  if (status === 'Pending Department Approval') {
    const days = elapsedDays(request.submitted_at, now);
    return {
      label: `Department review · Day ${days + 1}`,
      detail: days > 1 ? `${days} days since submission` : 'Within department review window',
      tone: days > 1 ? 'warning' : 'neutral',
    };
  }
  if (status === 'Pending Finance Head Review') {
    return {
      label: 'Finance Head decision',
      detail: 'At least one Finance member has approved',
      tone: 'warning',
    };
  }
  if (status === 'Awaiting Hard Copy Verification') {
    return {
      label: 'Hard-copy gate',
      detail: 'Manual document verification is required before processing',
      tone: 'warning',
    };
  }
  if (['Pending Finance Review', 'Documentation Required'].includes(status)) {
    const days = elapsedDays(request.department_approval_at || request.submitted_at, now);
    return {
      label: `${status === 'Documentation Required' ? 'Documents' : 'Finance review'} · Day ${days + 1}`,
      detail:
        days > 0
          ? `${days} day${days === 1 ? '' : 's'} since finance handoff`
          : 'Received by Finance today',
      tone: days > 1 ? 'danger' : days > 0 ? 'warning' : 'neutral',
    };
  }
  if (/returned/i.test(status)) {
    return {
      label: 'Returned for action',
      detail: 'Waiting for correction or re-review',
      tone: 'warning',
    };
  }
  if (/paid/i.test(status)) {
    return { label: 'Completed', detail: 'Payment workflow completed', tone: 'good' };
  }
  if (request.planned_check_date) {
    const today = manilaDay(now);
    const difference = dayNumber(request.planned_check_date) - dayNumber(today);
    if (difference < 0) {
      const days = Math.abs(difference);
      return {
        label: `${days} day${days === 1 ? '' : 's'} overdue`,
        detail: `Target was ${manilaDate(request.planned_check_date)}`,
        tone: 'danger',
      };
    }
    if (difference === 0) {
      return {
        label: 'Release due today',
        detail: 'Planned release date is today',
        tone: 'warning',
      };
    }
    return {
      label: `${difference} day${difference === 1 ? '' : 's'} to target`,
      detail: `Planned for ${manilaDate(request.planned_check_date)}`,
      tone: 'good',
    };
  }
  return {
    label: 'No target date',
    detail: 'Set a release target when processing begins',
    tone: /processing|check/i.test(status) ? 'warning' : 'neutral',
  };
}

export const financeActionOptions = (status: string, financeHead: boolean): Action[] => {
  if (['Pending Finance Review', 'Documentation Required'].includes(status)) {
    return [
      { value: 'member_approve', label: 'Approve as Finance member' },
      { value: 'member_reject', label: 'Return to Department Head' },
      { value: 'request_documents', label: 'Request documents / clarification' },
    ];
  }
  if (status === 'Pending Finance Head Review') {
    return financeHead
      ? [
          { value: 'head_approve', label: 'Finance Head approve' },
          { value: 'head_reject', label: 'Finance Head decline and return to Requestor' },
        ]
      : [];
  }
  if (status === 'Awaiting Hard Copy Verification') {
    return [
      {
        value: 'hard_copy_approve',
        label: 'Approve hard copies and start 3-day processing',
      },
    ];
  }
  if (['Approved for Payment', 'Payment Processing'].includes(status)) {
    return [{ value: 'payment_processing', label: 'Start legacy processing' }];
  }
  if (status === 'Processing') {
    return [{ value: 'check_preparation', label: 'Prepare check and documents' }];
  }
  if (status === 'Check Preparation') {
    return [{ value: 'awaiting_signatory', label: 'Send for check approval' }];
  }
  if (['Check Approval', 'Awaiting Signatory'].includes(status)) {
    return [{ value: 'check_released', label: 'Record check release' }];
  }
  if (['Check Released', 'Payment Released'].includes(status)) {
    return [{ value: 'payment_released', label: 'Mark payment completed' }];
  }
  return [];
};
