import { z } from "zod";

export const gradeInputSchema = z.object({
  studentId: z.string().min(1),
  score: z.coerce.number().min(0),
  comment: z.string().trim().max(1000).optional().nullable(),
});

export const enterGradesSchema = z.object({
  /** Exactly one of assignmentId / assessmentId. */
  assignmentId: z.string().optional(),
  assessmentId: z.string().optional(),
  termId: z.string().optional().nullable(),
  grades: z.array(gradeInputSchema).min(1).max(500),
}).refine((v) => !!v.assignmentId !== !!v.assessmentId, { message: "Provide exactly one of assignmentId or assessmentId" });
export type EnterGradesInput = z.infer<typeof enterGradesSchema>;

export const updateGradeSchema = z.object({
  score: z.coerce.number().min(0).optional(),
  comment: z.string().trim().max(1000).optional().nullable(),
  reason: z.string().trim().max(300).optional(),
});

export const gradeStatusActionSchema = z.object({
  courseId: z.string().min(1),
  termId: z.string().optional().nullable(),
  action: z.enum(["SUBMIT", "LOCK", "UNLOCK"]),
});

export const createAssessmentSchema = z.object({
  courseId: z.string().min(1),
  termId: z.string().optional().nullable(),
  title: z.string().trim().min(1).max(160),
  type: z.enum(["EXAM", "QUIZ", "TEST", "PROJECT", "PRACTICAL", "OTHER"]).default("TEST"),
  date: z.coerce.date().optional().nullable(),
  maxScore: z.coerce.number().positive().max(10000).default(100),
  weight: z.coerce.number().min(0).max(100).default(1),
});
export type CreateAssessmentInput = z.infer<typeof createAssessmentSchema>;
