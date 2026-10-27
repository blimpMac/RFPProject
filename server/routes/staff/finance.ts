import { financeRoles } from '../../domain/access.js';
import { flushEmailQueueForRequest } from '../../email/service.js';
import { requireStaff } from '../../lib/auth.js';
import { ensureMethod, HttpError, json, readJson } from '../../lib/http.js';
import { financeSchema, financeUpdateSchema } from '../../lib/validation.js';
import {
  isFinanceStageAction,
  performFinanceStageAction,
} from '../../services/finance-stage-workflow.js';
import type { RouteHandler } from '../context.js';

export const handleFinanceRoutes: RouteHandler = async ({ event, route, db }) => {
  if (route === 'finance/action') {
    ensureMethod(event, 'POST');
    const staff = await requireStaff(event, financeRoles);
    const input = financeSchema.parse(readJson(event));
    const normalizedAction =
      input.action === 'approve'
        ? 'member_approve'
        : input.action === 'reject'
          ? 'member_reject'
          : input.action;

    if (isFinanceStageAction(normalizedAction)) {
      const request = await performFinanceStageAction(
        db,
        {
          requestId: input.requestId,
          action: normalizedAction,
          remarks: input.remarks,
        },
        {
          email: staff.user.email || '',
          userId: staff.user.id,
          roles: staff.roles,
        },
      );
      const delivery = await flushEmailQueueForRequest(input.requestId);
      return json(200, { ok: true, request, delivery });
    }

    const result = await db.rpc('finance_workflow_action', {
      p_request_id: input.requestId,
      p_action: input.action,
      p_remarks: input.remarks,
      p_actor_email: staff.user.email,
      p_actor_user_id: staff.user.id,
      p_planned_check_date: input.plannedCheckDate || null,
      p_change_reason: input.changeReason || null,
    });
    if (result.error) throw new HttpError(409, result.error.message);
    const delivery = await flushEmailQueueForRequest(input.requestId);
    return json(200, { ok: true, request: result.data, delivery });
  }

  if (route === 'finance/update') {
    ensureMethod(event, 'POST');
    const staff = await requireStaff(event, financeRoles);
    const input = financeUpdateSchema.parse(readJson(event));
    const current = await db.from('rfp_requests').select('*').eq('id', input.requestId).single();
    if (current.error || !current.data) throw new HttpError(404, 'Request not found.');

    const request = current.data as Record<string, unknown>;
    const existingRaw =
      request.raw_record &&
      typeof request.raw_record === 'object' &&
      !Array.isArray(request.raw_record)
        ? (request.raw_record as Record<string, unknown>)
        : {};
    const existingOperations =
      existingRaw.finance_operations &&
      typeof existingRaw.finance_operations === 'object' &&
      !Array.isArray(existingRaw.finance_operations)
        ? (existingRaw.finance_operations as Record<string, unknown>)
        : {};
    const existingReceipt =
      existingRaw.finance_receipt &&
      typeof existingRaw.finance_receipt === 'object' &&
      !Array.isArray(existingRaw.finance_receipt)
        ? (existingRaw.finance_receipt as Record<string, unknown>)
        : {};
    const existingProcessing =
      existingReceipt.processing &&
      typeof existingReceipt.processing === 'object' &&
      !Array.isArray(existingReceipt.processing)
        ? (existingReceipt.processing as Record<string, unknown>)
        : {};
    const existingHardCopy =
      existingReceipt.hard_copy &&
      typeof existingReceipt.hard_copy === 'object' &&
      !Array.isArray(existingReceipt.hard_copy)
        ? (existingReceipt.hard_copy as Record<string, unknown>)
        : {};
    const nowIso = new Date().toISOString();
    const operations = {
      ...existingOperations,
      originals_received_date: input.originalsReceivedDate || null,
      document_verification: input.documentVerification || null,
      verification_remarks: input.verificationRemarks || null,
      updated_at: nowIso,
      updated_by: staff.user.email,
    };
    const verificationChanged =
      operations.originals_received_date !== (existingOperations.originals_received_date || null) ||
      operations.document_verification !== (existingOperations.document_verification || null) ||
      operations.verification_remarks !== (existingOperations.verification_remarks || null);
    if (operations.document_verification === 'Complete' && !operations.originals_received_date) {
      throw new HttpError(
        400,
        'Record the original documents received date before marking them complete.',
      );
    }
    if (
      operations.document_verification === 'Incomplete' &&
      !String(operations.verification_remarks || '').trim()
    ) {
      throw new HttpError(400, 'Describe the missing or incomplete documents.');
    }
    const previousDate = request.planned_check_date ? String(request.planned_check_date) : null;
    const nextDate = input.plannedCheckDate || null;
    if (previousDate && nextDate !== previousDate && !input.changeReason) {
      throw new HttpError(400, 'Add a reason for changing the planned release date.');
    }

    const receipt = {
      ...existingReceipt,
      hard_copy: {
        ...existingHardCopy,
        received_date: operations.originals_received_date,
        status: operations.document_verification,
        remarks: operations.verification_remarks,
        verified_by: verificationChanged
          ? staff.user.email
          : existingHardCopy.verified_by || existingOperations.updated_by || null,
        verified_at: verificationChanged
          ? nowIso
          : existingHardCopy.verified_at || existingOperations.updated_at || null,
      },
      processing: {
        ...existingProcessing,
        target_release_date: nextDate,
        check_number:
          input.checkNumber === undefined
            ? existingProcessing.check_number || null
            : input.checkNumber || null,
        payment_reference:
          input.paymentReference === undefined
            ? existingProcessing.payment_reference || null
            : input.paymentReference || null,
        status:
          input.processingStatus === undefined
            ? existingProcessing.status || null
            : input.processingStatus || null,
      },
      late_documents:
        input.lateDocuments === undefined
          ? Array.isArray(existingReceipt.late_documents)
            ? existingReceipt.late_documents
            : []
          : input.lateDocuments,
      updated_at: nowIso,
      updated_by: staff.user.email,
    };

    const version = Number(request.version || 1);
    const updated = await db
      .from('rfp_requests')
      .update({
        raw_record: {
          ...existingRaw,
          finance_operations: operations,
          finance_receipt: receipt,
        },
        finance_remarks: input.financeRemarks || null,
        planned_check_date: nextDate,
        check_date_last_updated:
          nextDate !== previousDate ? nowIso : request.check_date_last_updated,
        check_date_change_reason:
          nextDate !== previousDate ? input.changeReason || null : request.check_date_change_reason,
        version: version + 1,
      })
      .eq('id', input.requestId)
      .eq('version', version)
      .select('*')
      .single();
    if (updated.error || !updated.data) {
      throw new HttpError(
        409,
        updated.error?.message || 'This request changed. Refresh and try again.',
      );
    }
    const log = await db.from('approval_logs').insert({
      request_id: input.requestId,
      rfp_number: String(request.rfp_number),
      action: 'Digital RFP Receipt Updated',
      actor_email: staff.user.email,
      actor_user_id: staff.user.id,
      remarks:
        input.changeReason ||
        input.financeRemarks ||
        input.verificationRemarks ||
        (input.lateDocuments?.length ? `Late documents: ${input.lateDocuments.join(', ')}` : null),
      previous_status: String(request.final_status),
      new_status: String(request.final_status),
    });
    if (log.error) throw log.error;
    return json(200, { ok: true, request: updated.data });
  }

  return undefined;
};
