import { administrativeRoles } from '../domain/access.js';
import { HttpError } from '../lib/http.js';
import { adminClient } from '../lib/supabase.js';

type DatabaseClient = ReturnType<typeof adminClient>;
type RequestRow = Record<string, unknown>;

type FinanceStageInput = {
  requestId: string;
  action: string;
  remarks: string;
};

type FinanceActor = {
  email: string;
  userId: string;
  roles: string[];
};

const stageActions = new Set([
  'member_approve',
  'member_reject',
  'request_documents',
  'head_approve',
  'head_reject',
  'hard_copy_approve',
]);

const asRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

const asText = (value: unknown) => String(value ?? '').trim();

const uniqueEmails = (emails: (string | null | undefined)[]) => [
  ...new Set(emails.map((email) => email?.trim().toLowerCase()).filter(Boolean) as string[]),
];

export function isFinanceStageAction(action: string) {
  return stageActions.has(action);
}

function isFinanceHead(roles: string[]) {
  return roles.some((role) => administrativeRoles.includes(role));
}

async function emailsForRoles(db: DatabaseClient, roles: string[]) {
  const roleRows = await db.from('user_roles').select('user_id').in('role', roles);
  if (roleRows.error) throw roleRows.error;
  const userIds = [...new Set((roleRows.data || []).map((row) => row.user_id))];
  if (!userIds.length) return [];
  const profiles = await db
    .from('profiles')
    .select('id,email,active')
    .in('id', userIds)
    .eq('active', true);
  if (profiles.error) throw profiles.error;
  return uniqueEmails((profiles.data || []).map((profile) => profile.email));
}

async function departmentHeadEmails(db: DatabaseClient, request: RequestRow) {
  const normalizedDepartment = asText(request.normalized_department);
  const assignments = normalizedDepartment
    ? await db
        .from('department_approving_heads')
        .select('user_id')
        .eq('normalized_department', normalizedDepartment)
    : { data: [], error: null };
  if (assignments.error) throw assignments.error;
  const userIds = [...new Set((assignments.data || []).map((row) => row.user_id))];
  const profiles = userIds.length
    ? await db.from('profiles').select('id,email,active').in('id', userIds).eq('active', true)
    : { data: [], error: null };
  if (profiles.error) throw profiles.error;
  const emails = uniqueEmails((profiles.data || []).map((profile) => profile.email));
  if (emails.length) return emails;
  return uniqueEmails([asText(request.approver_email)]);
}

async function queueNotifications(
  db: DatabaseClient,
  request: RequestRow,
  recipients: string[],
  templateKey: string,
  subject: string,
  payload: Record<string, unknown>,
  version: number,
) {
  const emails = uniqueEmails(recipients);
  if (!emails.length) return;
  const requestId = asText(request.id);
  const rows = emails.map((email) => ({
    request_id: requestId,
    template_key: templateKey,
    recipient_email: email,
    subject,
    payload,
    deduplication_key: `${requestId}:${templateKey}:${version}:${email}`,
  }));
  const result = await db
    .from('email_notifications')
    .upsert(rows, { onConflict: 'deduplication_key', ignoreDuplicates: true });
  if (result.error) throw result.error;
}

function requireRemarks(remarks: string, label: string) {
  if (!remarks.trim()) throw new HttpError(400, `${label} requires a reason or remarks.`);
}

function requireStatus(currentStatus: string, allowed: string[], label: string) {
  if (!allowed.includes(currentStatus))
    throw new HttpError(409, `${label} is not available from ${currentStatus}.`);
}

export async function performFinanceStageAction(
  db: DatabaseClient,
  input: FinanceStageInput,
  actor: FinanceActor,
) {
  const current = await db.from('rfp_requests').select('*').eq('id', input.requestId).single();
  if (current.error || !current.data) throw new HttpError(404, 'Request not found.');
  const request = current.data as RequestRow;
  const currentStatus = asText(request.final_status);
  const raw = asRecord(request.raw_record);
  const workflow = asRecord(raw.finance_workflow);
  const financeOperations = asRecord(raw.finance_operations);
  const now = new Date();
  const nowIso = now.toISOString();
  const nextWorkflow: Record<string, unknown> = { ...workflow };
  const updateFields: Record<string, unknown> = {};
  const version = Number(request.version || 1);
  const nextVersion = version + 1;
  let nextStatus: string;
  let actionLabel: string;

  switch (input.action) {
    case 'member_approve':
      requireStatus(
        currentStatus,
        ['Pending Finance Review', 'Documentation Required'],
        'Finance member approval',
      );
      nextStatus = 'Pending Finance Head Review';
      actionLabel = 'Finance Member Approved';
      nextWorkflow.member_status = 'Approved';
      nextWorkflow.member_reviewed_at = nowIso;
      nextWorkflow.member_reviewed_by = actor.email;
      updateFields.finance_review = 'Member Approved';
      updateFields.finance_review_at = nowIso;
      updateFields.finance_reviewed_by = actor.userId;
      updateFields.finance_remarks = input.remarks.trim() || request.finance_remarks || null;
      break;

    case 'member_reject':
      requireStatus(
        currentStatus,
        ['Pending Finance Review', 'Documentation Required'],
        'Finance member return',
      );
      requireRemarks(input.remarks, 'Returning a request to the Department Head');
      nextStatus = 'Returned to Department Approver';
      actionLabel = 'Finance Member Returned';
      nextWorkflow.member_status = 'Returned';
      nextWorkflow.member_reviewed_at = nowIso;
      nextWorkflow.member_reviewed_by = actor.email;
      updateFields.finance_review = 'Returned';
      updateFields.finance_review_at = nowIso;
      updateFields.finance_reviewed_by = actor.userId;
      updateFields.finance_remarks = input.remarks.trim();
      break;

    case 'request_documents':
      requireStatus(
        currentStatus,
        ['Pending Finance Review', 'Documentation Required'],
        'Document request',
      );
      requireRemarks(input.remarks, 'Requesting documents');
      nextStatus = 'Documentation Required';
      actionLabel = 'Documentation Required';
      nextWorkflow.member_status = 'Documentation Required';
      nextWorkflow.member_reviewed_at = nowIso;
      nextWorkflow.member_reviewed_by = actor.email;
      updateFields.finance_review = 'Documentation Required';
      updateFields.finance_review_at = nowIso;
      updateFields.finance_reviewed_by = actor.userId;
      updateFields.finance_remarks = input.remarks.trim();
      break;

    case 'head_approve':
      if (!isFinanceHead(actor.roles))
        throw new HttpError(403, 'Only a Finance Head / Administrator can approve this stage.');
      requireStatus(currentStatus, ['Pending Finance Head Review'], 'Finance Head approval');
      nextStatus = 'Awaiting Hard Copy Verification';
      actionLabel = 'Finance Head Approved';
      nextWorkflow.head_status = 'Approved';
      nextWorkflow.head_reviewed_at = nowIso;
      nextWorkflow.head_reviewed_by = actor.email;
      updateFields.finance_review = 'Head Approved';
      updateFields.finance_review_at = nowIso;
      updateFields.finance_remarks = input.remarks.trim() || request.finance_remarks || null;
      break;

    case 'head_reject':
      if (!isFinanceHead(actor.roles))
        throw new HttpError(403, 'Only a Finance Head / Administrator can decline this stage.');
      requireStatus(currentStatus, ['Pending Finance Head Review'], 'Finance Head decline');
      requireRemarks(input.remarks, 'Finance Head decline');
      nextStatus = 'Returned to Requestor';
      actionLabel = 'Finance Head Declined';
      nextWorkflow.head_status = 'Declined';
      nextWorkflow.head_reviewed_at = nowIso;
      nextWorkflow.head_reviewed_by = actor.email;
      updateFields.finance_review = 'Head Declined';
      updateFields.finance_review_at = nowIso;
      updateFields.finance_remarks = input.remarks.trim();
      break;

    case 'hard_copy_approve': {
      requireStatus(currentStatus, ['Awaiting Hard Copy Verification'], 'Hard-copy approval');
      if (
        financeOperations.document_verification !== 'Complete' ||
        !asText(financeOperations.originals_received_date)
      ) {
        throw new HttpError(
          409,
          'Record the hard-copy received date and mark document verification Complete before approval.',
        );
      }
      const dueAt = new Date(now.getTime() + 3 * 24 * 60 * 60_000);
      nextStatus = 'Processing';
      actionLabel = 'Hard Copy Approved · Processing Started';
      nextWorkflow.hard_copy_status = 'Approved';
      nextWorkflow.hard_copy_approved_at = nowIso;
      nextWorkflow.hard_copy_approved_by = actor.email;
      nextWorkflow.processing_started_at = nowIso;
      nextWorkflow.processing_due_at = dueAt.toISOString();
      updateFields.finance_review = 'Approved';
      updateFields.finance_review_at = nowIso;
      updateFields.planned_check_date = dueAt.toISOString().slice(0, 10);
      break;
    }

    default:
      throw new HttpError(400, 'Unsupported Finance stage action.');
  }

  nextWorkflow.updated_at = nowIso;
  nextWorkflow.updated_by = actor.email;
  const updated = await db
    .from('rfp_requests')
    .update({
      ...updateFields,
      raw_record: { ...raw, finance_workflow: nextWorkflow },
      final_status: nextStatus,
      last_action: actionLabel,
      version: nextVersion,
    })
    .eq('id', input.requestId)
    .eq('version', version)
    .select('*')
    .single();
  if (updated.error || !updated.data) {
    throw new HttpError(
      409,
      updated.error?.message || 'This request changed. Refresh and try the action again.',
    );
  }

  const log = await db.from('approval_logs').insert({
    request_id: input.requestId,
    rfp_number: asText(request.rfp_number),
    action: actionLabel,
    actor_email: actor.email.toLowerCase(),
    actor_user_id: actor.userId,
    remarks: input.remarks.trim() || null,
    previous_status: currentStatus,
    new_status: nextStatus,
  });
  if (log.error) throw log.error;

  const rfpNumber = asText(request.rfp_number);
  if (input.action === 'member_approve') {
    const heads = await emailsForRoles(db, administrativeRoles);
    await queueNotifications(
      db,
      request,
      heads,
      'finance_head_review_required',
      `Finance Head review required: ${rfpNumber}`,
      { remarks: input.remarks.trim() || null },
      nextVersion,
    );
  } else if (input.action === 'member_reject') {
    const heads = await departmentHeadEmails(db, request);
    await queueNotifications(
      db,
      request,
      heads,
      'finance_returned',
      `${rfpNumber} returned to Department Head`,
      { remarks: input.remarks.trim() },
      nextVersion,
    );
  } else if (input.action === 'request_documents') {
    const recipients = [
      ...(await departmentHeadEmails(db, request)),
      asText(request.requestor_email),
    ];
    await queueNotifications(
      db,
      request,
      recipients,
      'documentation_required',
      `${rfpNumber} needs supporting documents`,
      { remarks: input.remarks.trim() },
      nextVersion,
    );
  } else if (input.action === 'head_approve') {
    const financeMembers = await emailsForRoles(db, ['finance_reviewer']);
    await queueNotifications(
      db,
      request,
      financeMembers,
      'hard_copy_verification_required',
      `Hard-copy verification required: ${rfpNumber}`,
      { remarks: input.remarks.trim() || null },
      nextVersion,
    );
  } else if (input.action === 'head_reject') {
    await queueNotifications(
      db,
      request,
      [asText(request.requestor_email)],
      'finance_head_rejected',
      `${rfpNumber} declined by Finance Head`,
      { remarks: input.remarks.trim() },
      nextVersion,
    );
  } else if (input.action === 'hard_copy_approve') {
    const dueAt = asText(nextWorkflow.processing_due_at);
    const recipients = [
      asText(request.requestor_email),
      ...(await departmentHeadEmails(db, request)),
    ];
    await queueNotifications(
      db,
      request,
      recipients,
      'processing_started',
      `${rfpNumber} is processing`,
      {
        processingDueAt: dueAt,
        plannedCheckDate: dueAt ? dueAt.slice(0, 10) : null,
        remarks: input.remarks.trim() || null,
      },
      nextVersion,
    );
  }

  return updated.data;
}
