import { manilaDate } from '../../lib/format';
import type { RfpRequest } from '../../types';
import { manilaDay } from '../requests/sla';
import {
  manilaReceiptSchedule,
  manilaCalendarDaysBetween,
} from '../../../shared/utils/processing-sla';

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
    !/paid|returned to requestor|liquidation/i.test(request.final_status),
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
  if (processingDue && !/paid|returned to requestor|liquidation/i.test(status)) {
    const processingStart =
      financeWorkflow(request).processing_started_at || request.submitted_at || now;
    const schedule = manilaReceiptSchedule(processingStart);
    const today = manilaDay(now);
    const overdue = manilaCalendarDaysBetween(schedule.day3, today);
    if (overdue > 0) {
      return {
        label: `${overdue} day${overdue === 1 ? '' : 's'} overdue`,
        detail: `3-day processing SLA ended on ${schedule.day3} (Philippine time)`,
        tone: 'danger',
      };
    }
    const currentDay = Math.max(0, manilaCalendarDaysBetween(schedule.day1, today) + 1);
    return {
      label:
        currentDay === 0
          ? 'Processing · Day 1 tomorrow'
          : `Processing · Day ${Math.min(3, currentDay)} of 3`,
      detail: `Day 1: ${schedule.day1} · Day 3 deadline: ${schedule.day3} (Philippine time)`,
      tone: currentDay >= 3 ? 'warning' : 'good',
    };
  }
  if (status === 'Pending Department Approval') {
    const schedule = manilaReceiptSchedule(request.submitted_at || now);
    const days = manilaCalendarDaysBetween(schedule.day1, manilaDay(now));
    return {
      label:
        days < 0 ? 'Department review · Day 1 tomorrow' : `Department review · Day ${days + 1}`,
      detail: `Received ${schedule.afterCutoff ? 'at/after' : 'before'} 3 PM · Day 1: ${schedule.day1}`,
      tone: days > 1 ? 'warning' : 'neutral',
    };
  }
  if (status === 'Pending Liquidation') {
    return {
      label: 'Expense liquidation due',
      detail: 'Awaiting an itemized expense report from the requestor',
      tone: 'warning',
    };
  }
  if (status === 'Liquidation Submitted') {
    return {
      label: 'Review liquidation',
      detail: 'Finance must verify the submitted expense summary',
      tone: 'warning',
    };
  }
  if (status === 'Liquidation Complete') {
    return {
      label: 'Liquidation completed',
      detail: 'Finance approved the submitted expense summary',
      tone: 'good',
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
  if (status === 'Liquidation Submitted') {
    return [
      { value: 'liquidation_approve', label: 'Approve expense liquidation' },
      { value: 'liquidation_return', label: 'Return expense summary for correction' },
    ];
  }
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
