import { flushEmailQueueForRequest } from '../email/service.js';
import { randomToken, seal, sha256 } from '../lib/crypto.js';
import { ensureMethod, HttpError, json, readJson } from '../lib/http.js';
import { normalizeDepartment } from '../lib/staff-access.js';
import {
  completeAttachmentSchema,
  decisionSchema,
  finalizeSchema,
  resubmitSchema,
  startSchema,
} from '../lib/validation.js';
import { enforceSubmissionLimit } from '../lib/rate-limit.js';
import { getPublicApprovers } from '../services/approving-heads.js';
import { rfpRequestTypes } from '../../shared/constants/request-types.js';
import {
  cancelPendingDepartmentReview,
  queueSubmissionReceipt,
} from '../services/workflow-notifications.js';
import type { RouteHandler } from './context.js';

export const handlePublicRoutes: RouteHandler = async ({ event, route, db, config }) => {
  if (route === 'public-config') {
    ensureMethod(event, 'GET');
    const { data } = await db
      .from('system_settings')
      .select('value')
      .eq('key', 'submission_options')
      .single();
    const approvers = await getPublicApprovers(db);
    const configuredOptions = (data?.value || {}) as { departments?: string[] };
    return json(200, {
      ok: true,
      options: { ...configuredOptions, requestTypes: [...rfpRequestTypes] },
      approvers,
      limits: { maxFiles: config.MAX_UPLOAD_FILES, maxSizeMb: config.MAX_UPLOAD_SIZE_MB },
    });
  }

  if (route === 'submissions/start') {
    ensureMethod(event, 'POST');
    await enforceSubmissionLimit(event);
    const input = startSchema.parse(readJson(event));
    if (
      input.attachments.length > config.MAX_UPLOAD_FILES ||
      input.attachments.some((file) => file.size > config.MAX_UPLOAD_SIZE_MB * 1024 * 1024)
    ) {
      throw new HttpError(400, 'Attachment limit exceeded.');
    }

    const optionRow = await db
      .from('system_settings')
      .select('value')
      .eq('key', 'submission_options')
      .single();
    if (optionRow.error) throw optionRow.error;
    const options = optionRow.data.value as { departments?: string[] };
    const departmentAllowed = options.departments?.some(
      (department) =>
        normalizeDepartment(department) === normalizeDepartment(input.request.department),
    );
    const requestTypeAllowed = rfpRequestTypes.some(
      (requestType) =>
        normalizeDepartment(requestType) === normalizeDepartment(input.request.rfpType),
    );
    if (!departmentAllowed || !requestTypeAllowed) {
      throw new HttpError(400, 'Department or Type is not an allowed option.');
    }

    const trackingToken = randomToken();
    const started = await db.rpc('start_rfp_submission', {
      p_request: input.request,
      p_idempotency_key: input.idempotencyKey,
      p_tracking_hash: sha256(trackingToken),
      p_attachments: input.attachments,
    });
    if (started.error) throw new HttpError(400, started.error.message);
    const existingRequest = await db
      .from('rfp_requests')
      .select('raw_record')
      .eq('id', started.data.requestId)
      .single();
    if (existingRequest.error) throw existingRequest.error;
    const existingRaw =
      existingRequest.data.raw_record &&
      typeof existingRequest.data.raw_record === 'object' &&
      !Array.isArray(existingRequest.data.raw_record)
        ? (existingRequest.data.raw_record as Record<string, unknown>)
        : {};
    const companyUpdate = await db
      .from('rfp_requests')
      .update({
        company: input.request.company,
        raw_record: {
          ...existingRaw,
          submission_checklist: input.request.attachmentChecklist || [],
        },
      })
      .eq('id', started.data.requestId);
    if (companyUpdate.error) throw companyUpdate.error;
    const items = await db
      .from('request_attachments')
      .select('id,original_filename,storage_path')
      .eq('request_id', started.data.requestId)
      .order('created_at');
    if (items.error) throw items.error;

    const uploads = [];
    for (const item of items.data || []) {
      const signed = await db.storage
        .from('rfp-attachments')
        .createSignedUploadUrl(item.storage_path);
      if (signed.error) throw signed.error;
      uploads.push({
        id: item.id,
        name: item.original_filename,
        path: item.storage_path,
        token: signed.data.token,
      });
    }
    return json(200, { ok: true, ...started.data, trackingToken, uploads });
  }

  if (route === 'submissions/attachment-complete') {
    ensureMethod(event, 'POST');
    const input = completeAttachmentSchema.parse(readJson(event));
    const request = await db
      .from('rfp_requests')
      .select('id')
      .eq('id', input.requestId)
      .eq('public_tracking_hash', sha256(input.trackingToken))
      .single();
    if (!request.data) throw new HttpError(403, 'Invalid submission credential.');
    const item = await db
      .from('request_attachments')
      .select('*')
      .eq('id', input.attachmentId)
      .eq('request_id', input.requestId)
      .single();
    if (!item.data?.storage_path) throw new HttpError(404, 'Attachment record not found.');

    const folder = input.requestId;
    const filename = item.data.storage_path.slice(folder.length + 1);
    const listed = await db.storage
      .from('rfp-attachments')
      .list(folder, { search: filename, limit: 10 });
    if (!listed.data?.some((file) => file.name === filename)) {
      throw new HttpError(409, 'The upload was not found in private storage.');
    }
    const updated = await db
      .from('request_attachments')
      .update({ status: 'available', uploaded_at: new Date().toISOString() })
      .eq('id', item.data.id);
    if (updated.error) throw updated.error;
    return json(200, { ok: true });
  }

  if (route === 'submissions/finalize') {
    ensureMethod(event, 'POST');
    const input = finalizeSchema.parse(readJson(event));
    const request = await db
      .from('rfp_requests')
      .select('id')
      .eq('id', input.requestId)
      .eq('public_tracking_hash', sha256(input.trackingToken))
      .single();
    if (!request.data) throw new HttpError(403, 'Invalid submission credential.');
    const reviewToken = randomToken();
    const expiresAt = new Date(Date.now() + config.REVIEW_TOKEN_HOURS * 60 * 60_000).toISOString();
    const finalized = await db.rpc('finalize_rfp_submission', {
      p_request_id: input.requestId,
      p_review_token_hash: sha256(reviewToken),
      p_review_token_ciphertext: seal(reviewToken),
      p_review_expires_at: expiresAt,
    });
    if (finalized.error) throw new HttpError(409, finalized.error.message);
    await queueSubmissionReceipt(
      db,
      input.requestId,
      finalized.data.rfpNumber,
      input.trackingToken,
    );
    const delivery = await flushEmailQueueForRequest(input.requestId);
    return json(200, { ok: true, ...finalized.data, delivery });
  }

  if (route === 'submissions/resubmit') {
    ensureMethod(event, 'POST');
    const input = resubmitSchema.parse(readJson(event));
    const reviewToken = randomToken();
    const expiresAt = new Date(Date.now() + config.REVIEW_TOKEN_HOURS * 60 * 60_000).toISOString();
    const result = await db.rpc('resubmit_returned_request', {
      p_request_id: input.requestId,
      p_tracking_hash: sha256(input.trackingToken),
      p_review_token_hash: sha256(reviewToken),
      p_review_token_ciphertext: seal(reviewToken),
      p_review_expires_at: expiresAt,
      p_correction_note: input.correctionNote,
    });
    if (result.error) throw new HttpError(409, result.error.message);
    const delivery = await flushEmailQueueForRequest(input.requestId);
    return json(200, { ok: true, request: result.data, delivery });
  }

  if (route.startsWith('track/')) {
    ensureMethod(event, 'GET');
    const token = decodeURIComponent(route.slice(6));
    if (token.length < 20) throw new HttpError(403, 'Invalid tracking credential.');
    const request = await db
      .from('rfp_requests')
      .select(
        'id,rfp_number,submitted_at,requestor_name,company,department,project_class,rfp_type,supplier_payee,purpose_description,amount,required_payment_date,approving_head,department_approval,department_approval_at,finance_review,finance_review_at,final_status,last_action,planned_check_date,raw_record',
      )
      .eq('public_tracking_hash', sha256(token))
      .single();
    if (request.error || !request.data) throw new HttpError(404, 'Request not found.');
    const rawRecord =
      request.data.raw_record &&
      typeof request.data.raw_record === 'object' &&
      !Array.isArray(request.data.raw_record)
        ? (request.data.raw_record as Record<string, unknown>)
        : {};
    const workflow =
      rawRecord.finance_workflow &&
      typeof rawRecord.finance_workflow === 'object' &&
      !Array.isArray(rawRecord.finance_workflow)
        ? (rawRecord.finance_workflow as Record<string, unknown>)
        : {};
    const financeOperations =
      rawRecord.finance_operations &&
      typeof rawRecord.finance_operations === 'object' &&
      !Array.isArray(rawRecord.finance_operations)
        ? (rawRecord.finance_operations as Record<string, unknown>)
        : {};
    const submissionChecklist = Array.isArray(rawRecord.submission_checklist)
      ? rawRecord.submission_checklist.filter((item): item is string => typeof item === 'string')
      : [];
    const [logs, attachments] = await Promise.all([
      db
        .from('approval_logs')
        .select('occurred_at,action,remarks,new_status')
        .eq('request_id', request.data.id)
        .order('occurred_at'),
      db
        .from('request_attachments')
        .select('id,original_filename,mime_type,status')
        .eq('request_id', request.data.id),
    ]);
    return json(200, {
      ok: true,
      request: { ...request.data, raw_record: undefined },
      workflow,
      financeOperations,
      submissionChecklist,
      logs: logs.data || [],
      attachments: attachments.data || [],
    });
  }

  if (!route.startsWith('review/')) return undefined;

  const token = decodeURIComponent(route.slice(7));
  if (event.httpMethod === 'GET') {
    const tokenRecord = await db
      .from('approval_tokens')
      .select('request_id,expires_at,used_at,revoked_at')
      .eq('token_hash', sha256(token))
      .single();
    const record = tokenRecord.data;
    if (
      !record ||
      record.used_at ||
      record.revoked_at ||
      new Date(record.expires_at) < new Date()
    ) {
      throw new HttpError(410, 'This review link is invalid, expired, or already used.');
    }
    const request = await db
      .from('rfp_requests')
      .select(
        'id,rfp_number,requestor_name,requestor_email,company,department,project_class,rfp_type,supplier_payee,purpose_description,amount,required_payment_date,final_status',
      )
      .eq('id', record.request_id)
      .single();
    if (request.error) throw request.error;
    const attachments = await db
      .from('request_attachments')
      .select('id,original_filename,mime_type,storage_path')
      .eq('request_id', record.request_id)
      .eq('status', 'available');
    if (attachments.error) throw attachments.error;
    const previews = await Promise.all(
      (attachments.data || []).map(async (item) => {
        if (!item.storage_path) {
          return {
            id: item.id,
            original_filename: item.original_filename,
            mime_type: item.mime_type,
            url: null,
            download_url: null,
          };
        }
        const [preview, download] = await Promise.all([
          db.storage.from('rfp-attachments').createSignedUrl(item.storage_path, 900),
          db.storage
            .from('rfp-attachments')
            .createSignedUrl(item.storage_path, 900, { download: item.original_filename }),
        ]);
        if (preview.error) throw preview.error;
        if (download.error) throw download.error;
        return {
          id: item.id,
          original_filename: item.original_filename,
          mime_type: item.mime_type,
          url: preview.data.signedUrl,
          download_url: download.data.signedUrl,
        };
      }),
    );
    return json(200, { ok: true, request: request.data, attachments: previews });
  }

  if (event.httpMethod === 'POST') {
    const input = decisionSchema.parse({ ...(readJson(event) as object), token });
    const decision = await db.rpc('consume_department_review', {
      p_token_hash: sha256(input.token),
      p_decision: input.decision,
      p_remarks: input.remarks,
    });
    if (decision.error) throw new HttpError(409, decision.error.message);
    await cancelPendingDepartmentReview(db, decision.data.id);
    const delivery = await flushEmailQueueForRequest(decision.data.id);
    return json(200, { ok: true, request: decision.data, delivery });
  }

  throw new HttpError(405, 'Method not allowed.');
};
