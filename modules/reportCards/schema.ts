import { z } from "zod";

export const generateReportCardsSchema = z.object({
  termId: z.string().min(1),
  /** Generate for one class, or for a single student. At least one is required. */
  classId: z.string().optional(),
  studentId: z.string().optional(),
}).refine((v) => v.classId || v.studentId, { message: "classId or studentId is required" });
export type GenerateReportCardsInput = z.infer<typeof generateReportCardsSchema>;

export const updateReportCardSchema = z.object({
  teacherComment: z.string().trim().max(3000).optional().nullable(),
  principalComment: z.string().trim().max(3000).optional().nullable(),
});

export const listReportCardsSchema = z.object({
  termId: z.string().optional(),
  classId: z.string().optional(),
  studentId: z.string().optional(),
  status: z.enum(["DRAFT", "PUBLISHED"]).optional(),
});
