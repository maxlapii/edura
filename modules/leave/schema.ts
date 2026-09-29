import { z } from "zod";
import { dateOnlySchema } from "@/lib/validation";

export const createLeaveRequestSchema = z
  .object({
    type: z.enum(["SICK", "PERSONAL", "ANNUAL", "TRAINING", "OTHER"]).default("PERSONAL"),
    startDate: dateOnlySchema,
    endDate: dateOnlySchema,
    reason: z.string().trim().max(1000).optional().nullable(),
    /** Admins may file on behalf of a teacher. */
    teacherId: z.string().optional(),
  })
  .refine((v) => v.endDate >= v.startDate, { message: "endDate must be on or after startDate", path: ["endDate"] });
export type CreateLeaveRequestInput = z.infer<typeof createLeaveRequestSchema>;

export const reviewLeaveSchema = z.object({
  action: z.enum(["APPROVE", "REJECT"]),
  comment: z.string().trim().max(1000).optional().nullable(),
});

export const listLeaveSchema = z.object({
  status: z.enum(["PENDING", "APPROVED", "REJECTED", "CANCELLED"]).optional(),
  from: dateOnlySchema.optional(),
  to: dateOnlySchema.optional(),
  scope: z.enum(["mine", "all"]).default("mine"),
});
