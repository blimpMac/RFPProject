import { z } from 'zod';

export const approvingHeadTeamSchema = z
  .object({
    headUserId: z.uuid(),
    coApproverUserIds: z
      .array(z.uuid())
      .min(2)
      .max(3)
      .refine((items) => new Set(items).size === items.length, 'Co-Approvers must be unique.'),
  })
  .refine((value) => !value.coApproverUserIds.includes(value.headUserId), {
    message: 'An account cannot be both Approver Head and Co-Approver.',
    path: ['coApproverUserIds'],
  });
