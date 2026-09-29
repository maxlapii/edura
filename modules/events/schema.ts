import { z } from "zod";

export const eventTypeSchema = z.enum(["SCHOOL_EVENT", "CLUB", "COMPETITION", "TRIP", "SPORTS", "ASSEMBLY", "PARENT_EVENT", "HOLIDAY", "TRAINING", "EXAM", "OTHER"]);
export const eventStatusSchema = z.enum(["DRAFT", "PENDING_APPROVAL", "SCHEDULED", "COMPLETED", "CANCELLED"]);
export const audienceSchema = z.enum(["SCHOOL", "TEACHERS", "DEPARTMENT", "CLASS", "STUDENTS", "PARENTS", "STAFF"]);

const eventBase = z.object({
  title: z.string().trim().min(1).max(200),
  type: eventTypeSchema.default("SCHOOL_EVENT"),
  description: z.string().trim().max(10000).optional().nullable(),
  startsAt: z.coerce.date(),
  endsAt: z.coerce.date(),
  location: z.string().trim().max(200).optional().nullable(),
  audience: audienceSchema.default("SCHOOL"),
  requiresApproval: z.boolean().default(false),
});

export const createEventSchema = eventBase
  .extend({
    participantUserIds: z.array(z.string().min(1)).max(1000).default([]),
    participantStudentIds: z.array(z.string().min(1)).max(2000).default([]),
  })
  .refine((v) => v.endsAt > v.startsAt, { message: "endsAt must be after startsAt", path: ["endsAt"] });
export type CreateEventInput = z.infer<typeof createEventSchema>;

export const updateEventSchema = eventBase
  .partial()
  .extend({ status: z.enum(["SCHEDULED", "COMPLETED"]).optional() })
  .refine((v) => !v.startsAt || !v.endsAt || v.endsAt > v.startsAt, { message: "endsAt must be after startsAt", path: ["endsAt"] });
export type UpdateEventInput = z.infer<typeof updateEventSchema>;

export const listEventsSchema = z.object({
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  type: eventTypeSchema.optional(),
  status: eventStatusSchema.optional(),
});
export type ListEventsInput = z.infer<typeof listEventsSchema>;

export const addEventParticipantsSchema = z
  .object({
    userIds: z.array(z.string().min(1)).max(1000).default([]),
    studentIds: z.array(z.string().min(1)).max(2000).default([]),
    role: z.string().trim().min(1).max(40).default("PARTICIPANT"),
  })
  .refine((v) => v.userIds.length + v.studentIds.length > 0, { message: "Provide at least one user or student" });
export type AddEventParticipantsInput = z.infer<typeof addEventParticipantsSchema>;
