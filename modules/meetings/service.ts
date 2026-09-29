import { prisma } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";
import type { AuthUser } from "@/lib/auth/types";
import { assertPermission, assertSchoolAccess, isAdmin, resolveSchoolId } from "@/lib/permissions";
import { AppError } from "@/lib/utils/errors";
import { audit } from "@/lib/audit";
import { notify, notifyMany } from "@/lib/notifications";
import { dispatch } from "@/lib/workflows/engine";
import { addDays } from "date-fns";
import type { CompleteMeetingInput, CreateMeetingInput, ListMeetingsInput, RespondMeetingInput, UpdateMeetingInput } from "./schema";

const include = {
  room: { select: { id: true, name: true, code: true } },
  organizer: { select: { id: true, name: true, email: true } },
  participants: { include: { user: { select: { id: true, name: true, email: true, role: true } } }, orderBy: { createdAt: "asc" } },
  actionItems: { include: { assignee: { select: { id: true, name: true } }, task: { select: { id: true, status: true } } }, orderBy: { createdAt: "asc" } },
} satisfies Prisma.MeetingInclude;

function fmt(d: Date) {
  return d.toISOString().slice(0, 16).replace("T", " ");
}

async function assertRoom(schoolId: string, roomId: string | null | undefined) {
  if (!roomId) return null;
  const room = await prisma.room.findUnique({ where: { id: roomId }, select: { id: true, schoolId: true, isActive: true } });
  if (!room || room.schoolId !== schoolId) throw AppError.validation("Room must belong to the same school");
  return room.id;
}

/** Validates that every user id exists, is active and belongs to the school. Returns the de-duplicated list. */
async function assertUsersInSchool(schoolId: string, userIds: string[]): Promise<string[]> {
  const ids = [...new Set(userIds)];
  if (ids.length === 0) return ids;
  const users = await prisma.user.findMany({ where: { id: { in: ids }, schoolId, isActive: true }, select: { id: true } });
  if (users.length !== ids.length) {
    const found = new Set(users.map((u) => u.id));
    throw AppError.validation("All participants must be active users of the same school", { invalid: ids.filter((id) => !found.has(id)) });
  }
  return ids;
}

function canManageMeeting(user: AuthUser, meeting: { organizerUserId: string }) {
  return meeting.organizerUserId === user.id || isAdmin(user);
}

export async function createMeeting(user: AuthUser, input: CreateMeetingInput) {
  assertPermission(user, "meetings:manage");
  const schoolId = resolveSchoolId(user);
  const roomId = await assertRoom(schoolId, input.roomId);
  const participantIds = (await assertUsersInSchool(schoolId, input.participantUserIds)).filter((id) => id !== user.id);
  const meeting = await prisma.meeting.create({
    data: {
      schoolId,
      title: input.title,
      type: input.type,
      startsAt: input.startsAt,
      endsAt: input.endsAt,
      roomId,
      location: input.location ?? null,
      agenda: input.agenda ?? null,
      organizerUserId: user.id,
      participants: { create: participantIds.map((userId) => ({ userId })) },
    },
    include,
  });
  await audit({ user, schoolId, action: "meeting.create", entityType: "Meeting", entityId: meeting.id, after: meeting });
  await notifyMany(participantIds, {
    schoolId,
    type: "MEETING_INVITE",
    title: `Meeting invitation: ${meeting.title}`,
    body: `${fmt(meeting.startsAt)} – ${fmt(meeting.endsAt)}${meeting.room ? ` · ${meeting.room.name}` : meeting.location ? ` · ${meeting.location}` : ""}. Organized by ${user.name}.`,
    link: `/meetings/${meeting.id}`,
  });
  return meeting;
}

export async function listMeetings(user: AuthUser, input: ListMeetingsInput = {}) {
  assertPermission(user, "meetings:read");
  const schoolId = resolveSchoolId(user);
  const where: Prisma.MeetingWhereInput = { schoolId, status: input.status, type: input.type };
  if (input.from) where.endsAt = { gte: input.from };
  if (input.to) where.startsAt = { lte: input.to };
  if (!isAdmin(user)) where.OR = [{ organizerUserId: user.id }, { participants: { some: { userId: user.id } } }];
  return prisma.meeting.findMany({ where, include, orderBy: { startsAt: "asc" }, take: 300 });
}

export async function getMeeting(user: AuthUser, id: string) {
  assertPermission(user, "meetings:read");
  const meeting = await prisma.meeting.findUnique({ where: { id }, include });
  if (!meeting) throw AppError.notFound("Meeting");
  assertSchoolAccess(user, meeting.schoolId);
  const involved = meeting.organizerUserId === user.id || meeting.participants.some((p) => p.userId === user.id);
  if (!involved && !isAdmin(user)) throw AppError.forbidden();
  return meeting;
}

export async function updateMeeting(user: AuthUser, id: string, input: UpdateMeetingInput) {
  assertPermission(user, "meetings:manage");
  const before = await getMeeting(user, id);
  if (!canManageMeeting(user, before)) throw AppError.forbidden("Only the organizer or an administrator can edit this meeting");
  if (before.status !== "SCHEDULED") throw AppError.conflict(`Meeting is ${before.status}`);
  const startsAt = input.startsAt ?? before.startsAt;
  const endsAt = input.endsAt ?? before.endsAt;
  if (endsAt <= startsAt) throw AppError.validation("endsAt must be after startsAt");
  const roomId = input.roomId === undefined ? undefined : await assertRoom(before.schoolId, input.roomId);

  let added: string[] = [];
  let removed: string[] = [];
  if (input.participantUserIds) {
    const wanted = (await assertUsersInSchool(before.schoolId, input.participantUserIds)).filter((uid) => uid !== before.organizerUserId);
    const current = before.participants.map((p) => p.userId);
    added = wanted.filter((uid) => !current.includes(uid));
    removed = current.filter((uid) => !wanted.includes(uid));
  }

  const meeting = await prisma.$transaction(async (tx) => {
    if (removed.length) await tx.meetingParticipant.deleteMany({ where: { meetingId: id, userId: { in: removed } } });
    if (added.length) await tx.meetingParticipant.createMany({ data: added.map((userId) => ({ meetingId: id, userId })), skipDuplicates: true });
    return tx.meeting.update({
      where: { id },
      data: {
        title: input.title,
        type: input.type,
        startsAt: input.startsAt,
        endsAt: input.endsAt,
        roomId,
        location: input.location,
        agenda: input.agenda,
      },
      include,
    });
  });
  await audit({ user, schoolId: before.schoolId, action: "meeting.update", entityType: "Meeting", entityId: id, before, after: meeting });
  if (added.length) {
    await notifyMany(added, { schoolId: before.schoolId, type: "MEETING_INVITE", title: `Meeting invitation: ${meeting.title}`, body: `${fmt(meeting.startsAt)} – ${fmt(meeting.endsAt)}`, link: `/meetings/${id}` });
  }
  const timeChanged = (input.startsAt && input.startsAt.getTime() !== before.startsAt.getTime()) || (input.endsAt && input.endsAt.getTime() !== before.endsAt.getTime());
  if (timeChanged) {
    const others = meeting.participants.map((p) => p.userId).filter((uid) => !added.includes(uid) && uid !== user.id);
    await notifyMany(others, { schoolId: before.schoolId, type: "MEETING_INVITE", title: `Meeting rescheduled: ${meeting.title}`, body: `Now ${fmt(meeting.startsAt)} – ${fmt(meeting.endsAt)}`, link: `/meetings/${id}` });
  }
  return meeting;
}

export async function cancelMeeting(user: AuthUser, id: string) {
  assertPermission(user, "meetings:manage");
  const before = await getMeeting(user, id);
  if (!canManageMeeting(user, before)) throw AppError.forbidden("Only the organizer or an administrator can cancel this meeting");
  if (before.status !== "SCHEDULED") throw AppError.conflict(`Meeting is already ${before.status}`);
  const meeting = await prisma.meeting.update({ where: { id }, data: { status: "CANCELLED" }, include });
  await audit({ user, schoolId: before.schoolId, action: "meeting.cancel", entityType: "Meeting", entityId: id, before, after: meeting });
  await notifyMany(
    meeting.participants.map((p) => p.userId).filter((uid) => uid !== user.id),
    { schoolId: before.schoolId, type: "GENERIC", title: `Meeting cancelled: ${meeting.title}`, body: `Scheduled for ${fmt(meeting.startsAt)}`, link: `/meetings/${id}` },
  );
  return meeting;
}

/** A participant accepts or declines an invitation. */
export async function respondToMeeting(user: AuthUser, id: string, input: RespondMeetingInput) {
  assertPermission(user, "meetings:read");
  const meeting = await prisma.meeting.findUnique({ where: { id }, select: { id: true, schoolId: true, status: true, title: true, organizerUserId: true } });
  if (!meeting) throw AppError.notFound("Meeting");
  assertSchoolAccess(user, meeting.schoolId);
  if (meeting.status !== "SCHEDULED") throw AppError.conflict(`Meeting is ${meeting.status}`);
  const participant = await prisma.meetingParticipant.findUnique({ where: { meetingId_userId: { meetingId: id, userId: user.id } } });
  if (!participant) throw AppError.forbidden("You are not invited to this meeting");
  const updated = await prisma.meetingParticipant.update({ where: { id: participant.id }, data: { status: input.status } });
  await audit({ user, schoolId: meeting.schoolId, action: "meeting.respond", entityType: "MeetingParticipant", entityId: participant.id, before: participant, after: updated });
  return updated;
}

/**
 * Closes a meeting: records minutes/decisions, creates action items and a Task for each
 * action item with an assignee, then dispatches MEETING_COMPLETED.
 */
export async function completeMeeting(user: AuthUser, id: string, input: CompleteMeetingInput) {
  assertPermission(user, "meetings:manage");
  const before = await getMeeting(user, id);
  if (!canManageMeeting(user, before)) throw AppError.forbidden("Only the organizer or an administrator can complete this meeting");
  if (before.status !== "SCHEDULED") throw AppError.conflict(`Meeting is already ${before.status}`);
  const schoolId = before.schoolId;

  const assigneeIds = input.actionItems.map((a) => a.assigneeUserId).filter((v): v is string => !!v);
  await assertUsersInSchool(schoolId, assigneeIds);
  const attended = input.attendedUserIds ? new Set(input.attendedUserIds) : null;

  const created: Array<{ taskId: string; assigneeUserId: string; title: string; dueDate: Date | null }> = [];
  const meeting = await prisma.$transaction(async (tx) => {
    for (const item of input.actionItems) {
      let taskId: string | null = null;
      if (item.assigneeUserId) {
        const task = await tx.task.create({
          data: {
            schoolId,
            title: item.description.length > 200 ? `${item.description.slice(0, 197)}…` : item.description,
            description: `Action item from meeting "${before.title}" (${fmt(before.startsAt)})`,
            assigneeUserId: item.assigneeUserId,
            createdByUserId: user.id,
            dueDate: item.dueDate ?? null,
            priority: "MEDIUM",
            source: "MEETING",
            sourceId: id,
          },
        });
        taskId = task.id;
        created.push({ taskId: task.id, assigneeUserId: item.assigneeUserId, title: task.title, dueDate: task.dueDate });
      }
      await tx.meetingActionItem.create({ data: { meetingId: id, description: item.description, assigneeUserId: item.assigneeUserId ?? null, dueDate: item.dueDate ?? null, taskId } });
    }
    if (attended) {
      await tx.meetingParticipant.updateMany({ where: { meetingId: id, userId: { in: [...attended] } }, data: { status: "ATTENDED" } });
    }
    return tx.meeting.update({ where: { id }, data: { status: "COMPLETED", minutes: input.minutes ?? before.minutes, decisions: input.decisions ?? before.decisions }, include });
  });
  await audit({ user, schoolId, action: "meeting.complete", entityType: "Meeting", entityId: id, before, after: meeting, metadata: { tasksCreated: created.map((c) => c.taskId) } });

  for (const t of created) {
    if (t.assigneeUserId === user.id) continue;
    await notify({ schoolId, userId: t.assigneeUserId, type: "TASK_ASSIGNED", title: `New task: ${t.title}`, body: t.dueDate ? `Due ${t.dueDate.toISOString().slice(0, 10)} · from meeting "${meeting.title}"` : `From meeting "${meeting.title}"`, link: "/tasks" });
  }
  await dispatch("MEETING_COMPLETED", schoolId, {
    sourceId: id,
    meetingId: id,
    meetingTitle: meeting.title,
    meetingType: meeting.type,
    participantUserIds: meeting.participants.map((p) => p.userId),
    organizerUserId: meeting.organizerUserId,
    organizerName: meeting.organizer.name,
    actionItems: meeting.actionItems.length,
  });
  return meeting;
}

/** Dashboard helper (no permission check): scheduled meetings the user organizes or is invited to (not declined) in the next `days` days. */
export async function upcomingMeetingsForUser(userId: string, days = 7, now = new Date()) {
  return prisma.meeting.findMany({
    where: {
      status: "SCHEDULED",
      startsAt: { gte: now, lte: addDays(now, days) },
      OR: [{ organizerUserId: userId }, { participants: { some: { userId, status: { not: "DECLINED" } } } }],
    },
    include: { room: { select: { id: true, name: true } }, organizer: { select: { id: true, name: true } }, _count: { select: { participants: true } } },
    orderBy: { startsAt: "asc" },
    take: 20,
  });
}
