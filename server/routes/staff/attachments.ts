import { z } from 'zod';
import { requireStaff } from '../../lib/auth.js';
import { ensureMethod, HttpError, json, readJson } from '../../lib/http.js';
import { isDepartmentOnly, normalizeDepartment } from '../../lib/staff-access.js';
import { getAssignedDepartments } from '../../services/approving-heads.js';
import type { RouteHandler } from '../context.js';

export const handleAttachmentRoutes: RouteHandler = async ({ event, route, db }) => {
  if (route.startsWith('digital-rfp/')) {
    ensureMethod(event, 'GET');
    const staff = await requireStaff(event, [
      'super_administrator',
      'finance_reviewer',
      'department_approver',
    ]);
    const requestId = z.uuid().parse(route.slice('digital-rfp/'.length));
    const [request, attachments] = await Promise.all([
      db.from('rfp_requests').select('*').eq('id', requestId).single(),
      db
        .from('request_attachments')
        .select('id,original_filename,status')
        .eq('request_id', requestId)
        .eq('status', 'available')
        .order('created_at'),
    ]);
    if (request.error || !request.data) throw new HttpError(404, 'Request not found.');
    if (attachments.error) throw attachments.error;
    if (isDepartmentOnly(staff.roles)) {
      const departments = await getAssignedDepartments(db, staff.user.id);
      if (!departments.includes(normalizeDepartment(request.data.department))) {
        throw new HttpError(403, 'This request belongs to a department you are not assigned to.');
      }
    }
    return json(200, { ok: true, request: request.data, attachments: attachments.data || [] });
  }

  if (route === 'request-attachments') {
    ensureMethod(event, 'GET');
    const staff = await requireStaff(event);
    const requestId = z.uuid().parse(event.queryStringParameters?.requestId);
    const request = await db
      .from('rfp_requests')
      .select('normalized_department')
      .eq('id', requestId)
      .single();
    if (request.error || !request.data) throw new HttpError(404, 'Request not found.');
    if (isDepartmentOnly(staff.roles)) {
      const departments = await getAssignedDepartments(db, staff.user.id);
      if (!departments.includes(request.data.normalized_department)) {
        throw new HttpError(403, 'This request belongs to a department you are not assigned to.');
      }
    }
    const attachments = await db
      .from('request_attachments')
      .select('id,original_filename,mime_type,storage_path')
      .eq('request_id', requestId)
      .eq('status', 'available')
      .order('created_at');
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
    return json(200, { ok: true, attachments: previews });
  }

  if (route !== 'attachments/url') return undefined;

  ensureMethod(event, 'POST');
  const staff = await requireStaff(event);
  const input = z.object({ attachmentId: z.uuid() }).parse(readJson(event));
  const item = await db
    .from('request_attachments')
    .select('storage_path,request_id')
    .eq('id', input.attachmentId)
    .eq('status', 'available')
    .single();
  if (!item.data?.storage_path) throw new HttpError(404, 'Document not found.');
  if (isDepartmentOnly(staff.roles)) {
    const request = await db
      .from('rfp_requests')
      .select('normalized_department')
      .eq('id', item.data.request_id)
      .single();
    const departments = await getAssignedDepartments(db, staff.user.id);
    if (
      request.error ||
      !request.data ||
      !departments.includes(request.data.normalized_department)
    ) {
      throw new HttpError(403, 'This document belongs to a department you are not assigned to.');
    }
  }
  const signed = await db.storage
    .from('rfp-attachments')
    .createSignedUrl(item.data.storage_path, 300);
  if (signed.error) throw signed.error;
  return json(200, { ok: true, url: signed.data.signedUrl });
};
