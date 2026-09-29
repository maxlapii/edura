import { z } from "zod";

export const announcementAudienceSchema = z.enum(["SCHOOL", "TEACHERS", "DEPARTMENT", "CLASS", "STUDENTS", "PARENTS", "STAFF"]);
export const prioritySchema = z.enum(["LOW", "NORMAL", "HIGH", "URGENT"]);

export const attachmentSchema = z.object({
  name: z.string().trim().min(1).max(200),
  url: z.string().trim().min(1).max(2000),
  size: z.number().int().min(0).optional(),
  contentType: z.string().trim().max(100).optional(),
});
export type Attachment = z.infer<typeof attachmentSchema>;

const announcementBase = z.object({
  title: z.string().trim().min(1).max(200),
  body: z.string().trim().min(1).max(20000),
  audience: announcementAudienceSchema.default("SCHOOL"),
  /** departmentId when audience = DEPARTMENT, classId when audience = CLASS. */
  targetId: z.string().optional().nullable(),
  priority: prioritySchema.default("NORMAL"),
  publishAt: z.coerce.date().optional(),
  expiresAt: z.coerce.date().optional().nullable(),
  attachments: z.array(attachmentSchema).max(20).default([]),
});

function needsTarget(audience: string) {
  return audience === "DEPARTMENT" || audience === "CLASS";
}

export const createAnnouncementSchema = announcementBase
  .refine((v) => !needsTarget(v.audience) || !!v.targetId, { message: "targetId is required for DEPARTMENT and CLASS audiences", path: ["targetId"] })
  .refine((v) => !v.expiresAt || !v.publishAt || v.expiresAt > v.publishAt, { message: "expiresAt must be after publishAt", path: ["expiresAt"] });
export type CreateAnnouncementInput = z.infer<typeof createAnnouncementSchema>;

export const updateAnnouncementSchema = announcementBase
  .partial()
  .refine((v) => !v.audience || !needsTarget(v.audience) || !!v.targetId, { message: "targetId is required for DEPARTMENT and CLASS audiences", path: ["targetId"] });
export type UpdateAnnouncementInput = z.infer<typeof updateAnnouncementSchema>;

export const listAnnouncementsSchema = z.object({
  audience: announcementAudienceSchema.optional(),
  unreadOnly: z.enum(["true", "false"]).optional(),
  /** Managers only: include scheduled (future) and expired announcements. Default true for managers. */
  includeInactive: z.enum(["true", "false"]).optional(),
});
export type ListAnnouncementsInput = z.infer<typeof listAnnouncementsSchema>;
