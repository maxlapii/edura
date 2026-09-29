import { z } from "zod";

export const chatMessageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().trim().min(1).max(8000),
});
export type ChatMessage = z.infer<typeof chatMessageSchema>;

export const chatSchema = z.object({
  messages: z.array(chatMessageSchema).min(1).max(40),
});
export type ChatInput = z.infer<typeof chatSchema>;

export const draftLessonPlanSchema = z.object({
  courseId: z.string().min(1),
  topic: z.string().trim().min(2).max(200),
  duration: z.number().int().min(10).max(300).optional().describe("Lesson length in minutes"),
  objectives: z.string().trim().max(2000).optional(),
  notes: z.string().trim().max(2000).optional(),
});
export type DraftLessonPlanInput = z.infer<typeof draftLessonPlanSchema>;

/** Shape of the JSON draft the model must return (mirrors createLessonPlanSchema fields). */
export const lessonPlanDraftSchema = z.object({
  title: z.string().trim().min(1).max(160),
  curriculumTopic: z.string().trim().max(200).nullable().default(null),
  objectives: z.string().trim().max(5000),
  activities: z.string().trim().max(10000),
  materials: z.string().trim().max(5000).nullable().default(null),
  homework: z.string().trim().max(5000).nullable().default(null),
});
export type LessonPlanDraft = z.infer<typeof lessonPlanDraftSchema> & { aiGenerated: true };

export const draftParentMessageSchema = z.object({
  studentId: z.string().min(1),
  purpose: z.string().trim().min(3).max(1000),
  tone: z.enum(["friendly", "formal", "concerned", "encouraging"]).optional(),
  points: z.array(z.string().trim().min(1).max(300)).max(10).optional(),
});
export type DraftParentMessageInput = z.infer<typeof draftParentMessageSchema>;

export const parentMessageDraftSchema = z.object({
  subject: z.string().trim().min(1).max(200),
  body: z.string().trim().min(1).max(5000),
});

export const rewriteTextSchema = z.object({
  text: z.string().trim().min(1).max(8000),
  instruction: z.string().trim().min(2).max(500),
});
export type RewriteTextInput = z.infer<typeof rewriteTextSchema>;

export const studentSummarySchema = z.object({ studentId: z.string().min(1) });
export type StudentSummaryInput = z.infer<typeof studentSummarySchema>;

export const meetingSummarySchema = z.object({ meetingId: z.string().min(1) });
export type MeetingSummaryInput = z.infer<typeof meetingSummarySchema>;

export const meetingSummaryDraftSchema = z.object({
  summary: z.string().trim().min(1).max(5000),
  actionItems: z
    .array(
      z.object({
        description: z.string().trim().min(1).max(500),
        assignee: z.string().trim().max(120).nullable().default(null),
        dueDate: z.string().trim().max(40).nullable().default(null),
      }),
    )
    .max(25)
    .default([]),
});

export const adminQuestionSchema = z.object({ question: z.string().trim().min(3).max(2000) });
export type AdminQuestionInput = z.infer<typeof adminQuestionSchema>;
