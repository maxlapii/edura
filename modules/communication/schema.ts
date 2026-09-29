import { z } from "zod";

export const messageAudienceSchema = z.enum(["TEACHERS", "STAFF", "PARENTS", "STUDENTS"]);

export const messageRecipientsSchema = z
  .object({
    userIds: z.array(z.string().min(1)).max(500).optional(),
    classId: z.string().optional(),
    departmentId: z.string().optional(),
    audience: messageAudienceSchema.optional(),
  })
  .refine((r) => (r.userIds?.length ?? 0) > 0 || r.classId || r.departmentId || r.audience, { message: "At least one recipient target is required" });
export type MessageRecipientsInput = z.infer<typeof messageRecipientsSchema>;

export const sendMessageSchema = z.object({
  subject: z.string().trim().min(1).max(200),
  body: z.string().trim().min(1).max(20000),
  recipients: messageRecipientsSchema,
  threadId: z.string().optional().nullable(),
});
export type SendMessageInput = z.infer<typeof sendMessageSchema>;

export const listMessagesSchema = z.object({
  box: z.enum(["inbox", "sent"]).default("inbox"),
  unreadOnly: z.enum(["true", "false"]).optional(),
});
export type ListMessagesQuery = z.infer<typeof listMessagesSchema>;

export const messageTemplateSchema = z.object({
  name: z.string().trim().min(1).max(120),
  category: z.string().trim().min(1).max(40).default("GENERAL"),
  subject: z.string().trim().min(1).max(200),
  body: z.string().trim().min(1).max(20000),
});
export type MessageTemplateInput = z.infer<typeof messageTemplateSchema>;

export const updateMessageTemplateSchema = messageTemplateSchema.partial();
export type UpdateMessageTemplateInput = z.infer<typeof updateMessageTemplateSchema>;

export const listMessageTemplatesSchema = z.object({
  category: z.string().trim().max(40).optional(),
});

export const renderTemplateQuerySchema = z.object({
  studentId: z.string().min(1),
});
