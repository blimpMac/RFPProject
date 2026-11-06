import { z } from 'zod';
const toCentavos = (amount: number) => Math.round(amount * 100);

const companies = ['Greenlight Power Inc.', 'Greenmetal Electric Manufacturing Corp.'] as const;

export const allowedMimes = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
] as const;
const money = z
  .number()
  .finite()
  .nonnegative()
  .max(999999999.99)
  .refine(
    (amount) => Math.abs(toCentavos(amount) - amount * 100) < 0.00001,
    'Use no more than two decimal places.',
  );
const rfExpenseSchema = z.object({
  date: z.iso.date(),
  invoiceOrNo: z.string().trim().min(1).max(160),
  name: z.string().trim().min(2).max(160),
  itemDescription: z.string().trim().min(2).max(280),
  account: z.string().trim().min(1).max(120),
  amount: money.positive(),
});
const rfUnliquidatedAdvanceSchema = z.object({
  date: z.iso.date(),
  name: z.string().trim().min(2).max(160),
  purpose: z.string().trim().min(2).max(180),
  amount: money.positive(),
});
export const rfLiquidationSchema = z.object({
  custodianName: z
    .string()
    .trim()
    .min(3)
    .max(120)
    .refine((name) => name.split(/\s+/u).length >= 2, 'Enter custodian first and last name.'),
  periodCovered: z.string().trim().min(2).max(120),
  projectSof: z.string().trim().min(1).max(180),
  revolvingFundAmount: money.positive(),
  previousReplenishment: money,
  cashOnHandAsOf: z.iso.date(),
  expenses: z.array(rfExpenseSchema).min(1).max(2000),
  unliquidatedAdvances: z.array(rfUnliquidatedAdvanceSchema).max(200).default([]),
});

export const requestSchema = z
  .object({
    requestorName: z
      .string()
      .trim()
      .min(3)
      .max(120)
      .refine(
        (name) => name.split(/\s+/u).filter(Boolean).length >= 2,
        'Enter the complete first and last name of the requestor.',
      ),
    requestorEmail: z.string().trim().toLowerCase().email().max(160),
    company: z.enum(companies),
    department: z.string().trim().min(1).max(100),
    projectClass: z.string().trim().min(1).max(160),
    rfpType: z.string().trim().min(1).max(100),
    requestType: z.enum(['Regular', 'Emergency']),
    supplierPayee: z.string().trim().min(1).max(180),
    purposeDescription: z.string().trim().min(5).max(3000),
    amount: z.coerce.number().positive().max(999999999999.99),
    requiredPaymentDate: z.iso.date(),
    approvingHead: z.string().trim().min(2).max(160),
    attachmentChecklist: z.array(z.string().trim().min(1).max(180)).max(40).default([]),
    liquidationExpenses: z
      .array(
        z.object({
          date: z.iso.date(),
          description: z.string().trim().min(2).max(280),
          amount: z.coerce.number().positive().max(999999999.99),
        }),
      )
      .max(2000)
      .default([]),
    rfLiquidation: rfLiquidationSchema.optional(),
  })
  .superRefine((request, ctx) => {
    if (request.rfpType !== 'RF Liquidation') return;
    if (!request.rfLiquidation) {
      ctx.addIssue({
        code: 'custom',
        path: ['rfLiquidation'],
        message: 'Complete the RF liquidation form before submitting.',
      });
      return;
    }
    const expensesTotal =
      request.rfLiquidation.expenses.reduce((total, row) => total + toCentavos(row.amount), 0) /
      100;
    if (toCentavos(request.amount) !== toCentavos(expensesTotal)) {
      ctx.addIssue({
        code: 'custom',
        path: ['amount'],
        message:
          'RF request amount must equal the combined expense total across all RF form copies.',
      });
    }
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
    'member_approve',
    'member_reject',
    'head_approve',
    'head_reject',
    'hard_copy_approve',
    'request_documents',
    'payment_processing',
    'check_preparation',
    'awaiting_signatory',
    'check_released',
    'payment_released',
    'liquidation_approve',
    'liquidation_return',
  ]),
  remarks: z.string().trim().max(1500).default(''),
  plannedCheckDate: z.iso.date().nullable().optional(),
  changeReason: z.string().trim().max(1000).nullable().optional(),
});
export const financeUpdateSchema = z.object({
  requestId: z.uuid(),
  originalsReceivedDate: z.iso.date().nullable().optional(),
  documentVerification: z.enum(['Complete', 'Incomplete']).nullable().optional(),
  verificationRemarks: z.string().trim().max(1500).nullable().optional(),
  financeRemarks: z.string().trim().max(1500).nullable().optional(),
  plannedCheckDate: z.iso.date().nullable().optional(),
  changeReason: z.string().trim().max(1000).nullable().optional(),
  processingStatus: z
    .enum(['Check Preparation', 'Check Approval', 'Check Released', 'Paid'])
    .nullable()
    .optional(),
  lateDocuments: z.array(z.string().trim().min(1).max(180)).max(40).optional(),
});
export const resubmitSchema = z.object({
  requestId: z.uuid(),
  trackingToken: z.string().min(20),
  correctionNote: z.string().trim().min(2).max(1500),
  corrections: z
    .object({
      projectClass: z.string().trim().min(1).max(160),
      supplierPayee: z.string().trim().min(1).max(180),
      purposeDescription: z.string().trim().min(5).max(3000),
      amount: z.coerce.number().positive().max(999999999999.99),
      requiredPaymentDate: z.iso.date(),
      requestType: z.enum(['Regular', 'Emergency']),
    })
    .optional(),
});
export const liquidationSubmissionSchema = z.object({
  requestId: z.uuid(),
  trackingToken: z.string().min(20),
  expenses: z
    .array(
      z.object({
        date: z.iso.date(),
        description: z.string().trim().min(2).max(280),
        amount: z.coerce.number().positive().max(999999999.99),
      }),
    )
    .min(1)
    .max(100),
});
export const departmentRereviewSchema = z.object({
  requestId: z.uuid(),
  decision: z.enum(['approve', 'reject']),
  remarks: z.string().trim().max(1500).default(''),
});
