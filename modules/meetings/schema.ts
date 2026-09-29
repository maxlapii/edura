import { z } from "zod";

export const meetingTypeSchema = z.enum(["STAFF", "DEPARTMENT", "PARENT", "TEACHER", "MANAGEMENT", "OTHER"]);
export const meetingStatusSchema = z.enum(["SCHEDULED", "COMPLETED", "CANCELLED"]);

const meetingBase = z.object({
  title: z.string().trim().min(1).max(200),
  type: meetingTypeSchema.default("STAFF"),
  startsAt: z.coerce.date(),
  endsAt: z.coerce.date(),
  roomId: z.string().optional().nullable(),
  location: z.string().trim().max(200).optional().nullable(),
  agenda: z.string().trim().max(10000).optional().nullable(),
  participantUserIds: z.array(z.string().min(1)).max(500).default([]),
});

export const createMeetingSchema = meetingBase.refine((v) => v.endsAt > v.startsAt, { message: "endsAt must be after startsAt", path: ["endsAt"] });
export type CreateMeetingInput = z.infer<typeof createMeetingSchema>;

export const updateMeetingSchema = meetingBase
  .partial()
  .refine((v) => !v.startsAt || !v.endsAt || v.endsAt > v.startsAt, { message: "endsAt must be after startsAt", path: ["endsAt"] });
export type UpdateMeetingInput = z.infer<typeof updateMeetingSchema>;

export const listMeetingsSchema = z.object({
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  status: meetingStatusSchema.optional(),
  type: meetingTypeSchema.optional(),
});
export type ListMeetingsInput = z.infer<typeof listMeetingsSchema>;

export const respondMeetingSchema = z.object({
  status: z.enum(["ACCEPTED", "DECLINED"]),
});
export type RespondMeetingInput = z.infer<typeof respondMeetingSchema>;

export const meetingActionItemSchema = z.object({
  description: z.string().trim().min(1).max(1000),
  assigneeUserId: z.string().optional().nullable(),
  dueDate: z.coerce.date().optional().nullable(),
});

export const completeMeetingSchema = z.object({
  minutes: z.string().trim().max(50000).optional().nullable(),
  decisions: z.string().trim().max(20000).optional().nullable(),
  actionItems: z.array(meetingActionItemSchema).max(100).default([]),
  /** User ids of invitees who actually attended (marked ATTENDED). */
  attendedUserIds: z.array(z.string().min(1)).max(500).optional(),
});
export type CompleteMeetingInput = z.infer<typeof completeMeetingSchema>;
