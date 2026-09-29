import { z } from "zod";

export const approvalStatusSchema = z.enum(["PENDING", "APPROVED", "REJECTED", "CANCELLED"]);
export const approvalTypeSchema = z.enum(["LEAVE", "EVENT", "TRIP", "RESOURCE_REQUEST", "PURCHASE_REQUEST", "REPORT_CARD", "SPECIAL_ACTIVITY"]);

export const listApprovalsSchema = z.object({
  status: approvalStatusSchema.optional(),
  type: approvalTypeSchema.optional(),
  /** "all" (school-wide, requires approvals:read) or "mine" (own requests). Defaults to "all" for approvers, "mine" otherwise. */
  scope: z.enum(["mine", "all"]).optional(),
});
export type ListApprovalsInput = z.infer<typeof listApprovalsSchema>;

export const decideApprovalSchema = z.object({
  action: z.enum(["APPROVE", "REJECT"]),
  comment: z.string().trim().max(1000).optional().nullable(),
});
export type DecideApprovalInput = z.infer<typeof decideApprovalSchema>;
