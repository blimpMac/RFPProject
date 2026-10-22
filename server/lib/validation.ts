import { z } from 'zod';

export const allowedMimes = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
] as const;
export const requestSchema = z.object({
  requestorName: z.string().trim().min(2).max(120),
  requestorEmail: z.string().trim().toLowerCase().email().max(160),
  department: z.string().trim().min(1).max(100),
  projectClass: z.string().trim().min(1).max(160),
  rfpType: z.string().trim().min(1).max(100),
  supplierPayee: z.string().trim().min(1).max(180),
  purposeDescription: z.string().trim().min(5).max(3000),
  amount: z.coerce.number().positive().max(999999999999.99),
  requiredPaymentDate: z.iso.date(),
  approvingHead: z.string().trim().min(2).max(160),
});
export const attachmentSchema = z.object({
  name: z.string().min(1).max(180),
  type: z.enum(allowedMimes),
  size: z.number().int().positive(),
});
export const startSchema = z.object({
  request: requestSchema,
  attachments: z.array(attachmentSchema),
  idempotencyKey: z.uuid(),
});
export const completeAttachmentSchema = z.object({
  requestId: z.uuid(),
  trackingToken: z.string().min(20),
  attachmentId: z.uuid(),
});
export const finalizeSchema = z.object({ requestId: z.uuid(), trackingToken: z.string().min(20) });
export const decisionSchema = z.object({
  token: z.string().min(20),
  decision: z.enum(['approve', 'reject']),
  remarks: z.string().trim().max(1500).default(''),
});
export const financeSchema = z.object({
  requestId: z.uuid(),
  action: z.enum([
    'approve',
    'reject',
    'request_documents',
    'payment_processing',
    'check_preparation',
    'awaiting_signatory',
    'check_released',
    'payment_released',
  ]),
  remarks: z.string().trim().max(1500).default(''),
  plannedCheckDate: z.iso.date().nullable().optional(),
  changeReason: z.string().trim().max(1000).nullable().optional(),
});
export const resubmitSchema = z.object({
  requestId: z.uuid(),
  trackingToken: z.string().min(20),
  correctionNote: z.string().trim().min(2).max(1500),
});
export const departmentRereviewSchema = z.object({
  requestId: z.uuid(),
  decision: z.enum(['approve', 'reject']),
  remarks: z.string().trim().max(1500).default(''),
});
