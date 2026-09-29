import { prisma } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";
import type { AuthUser } from "@/lib/auth/types";
import { assertPermission, assertSchoolAccess, hasPermission, isAdmin, resolveSchoolId } from "@/lib/permissions";
import { AppError } from "@/lib/utils/errors";
import { audit } from "@/lib/audit";
import { notify, notifyMany, schoolAdminUserIds } from "@/lib/notifications";
import { dispatch } from "@/lib/workflows/engine";
import { createApproval } from "@/modules/approvals/service";
import type { AddEventParticipantsInput, CreateEventInput, ListEventsInput, UpdateEventInput } from "./schema";

const include = {
  organizer: { select: { id: true, name: true, email: true } },
  participants: {
    include: {
      user: { select: { id: true, name: true, email: true, role: true } },
      student: { select: { id: true, firstName: true, lastName: true, studentNumber: true, classId: true } },
    },
    orderBy: { createdAt: "asc" },
  },
  _count: { select: { participants: true } },
} satisfies Prisma.EventInclude;

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

async function assertStudentsInSchool(schoolId: string, studentIds: string[]): Promise<string[]> {
  const ids = [...new Set(studentIds)];
  if (ids.length === 0) return ids;
  const students = await prisma.student.findMany({ where: { id: { in: ids }, schoolId }, select: { id: true } });
  if (students.length !== ids.length) {
    const found = new Set(students.map((s) => s.id));
    throw AppError.validation("All students must belong to the same school", { invalid: ids.filter((id) => !found.has(id)) });
  }
  return ids;
}

function canManageEvent(user: AuthUser, event: { organizerUserId: string | null }) {
  return isAdmin(user) || (!!event.organizerUserId && event.organizerUserId === user.id);
}

/** Role-based visibility clause. Admins see everything. */
function visibilityWhere(user: AuthUser): Prisma.EventWhereInput {
  if (isAdmin(user)) return {};
  if (user.role === "STUDENT") {
    return {
      status: "SCHEDULED",
      OR: [
        { audience: { in: ["SCHOOL", "STUDENTS"] } },
        ...(user.studentId ? [{ participants: { some: { studentId: user.studentId } } }] : []),
        { participants: { some: { userId: user.id } } },
      ],
    };
  }
  if (user.role === "PARENT") {
    return {
      status: "SCHEDULED",
      OR: [
        { audience: { in: ["SCHOOL", "PARENTS"] } },
        ...(user.guardianId ? [{ participants: { some: { student: { guardians: { some: { guardianId: user.guardianId } } } } } }] : []),
        { participants: { some: { userId: user.id } } },
      ],
    };
  }
  // Teachers, department heads and staff: everything that is not an unapproved draft of somebody else.
  return {
    OR: [{ status: { in: ["SCHEDULED", "COMPLETED", "CANCELLED"] } }, { organizerUserId: user.id }, { participants: { some: { userId: user.id } } }],
  };
}

export async function createEvent(user: AuthUser, input: CreateEventInput) {
  assertPermission(user, "events:manage");
  const schoolId = resolveSchoolId(user);
  const userIds = await assertUsersInSchool(schoolId, input.participantUserIds);
  const studentIds = await assertStudentsInSchool(schoolId, input.participantStudentIds);
  const needsApproval = input.requiresApproval && !isAdmin(user);
  const status = needsApproval ? "PENDING_APPROVAL" : "SCHEDULED";

  const { event, approval } = await prisma.$transaction(async (tx) => {
    const e = await tx.event.create({
      data: {
        schoolId,
        title: input.title,
        type: input.type,
        description: input.description ?? null,
        startsAt: input.startsAt,
        endsAt: input.endsAt,
        location: input.location ?? null,
        audience: input.audience,
        requiresApproval: input.requiresApproval,
        status,
        organizerUserId: user.id,
        participants: {
          create: [...userIds.map((userId) => ({ userId })), ...studentIds.map((studentId) => ({ studentId }))],
        },
      },
      include,
    });
    const a = needsApproval
      ? await createApproval(
          schoolId,
          { type: input.type === "TRIP" ? "TRIP" : "EVENT", entityType: "Event", entityId: e.id, title: `${input.type === "TRIP" ? "Trip" : "Event"}: ${e.title} (${e.startsAt.toISOString().slice(0, 10)})`, requesterUserId: user.id },
          tx,
        )
      : null;
    return { event: e, approval: a };
  });

  await audit({ user, schoolId, action: "event.create", entityType: "Event", entityId: event.id, after: event, metadata: approval ? { approvalId: approval.id } : undefined });
  if (approval) {
    await notifyMany(await schoolAdminUserIds(schoolId), { schoolId, type: "APPROVAL_REQUESTED", title: `Approval requested: ${approval.title}`, body: `Requested by ${user.name}`, link: `/approvals/${approval.id}` });
  }
  await dispatch("EVENT_CREATED", schoolId, {
    sourceId: event.id,
    eventId: event.id,
    title: event.title,
    type: event.type,
    status: event.status,
    audience: event.audience,
    startsAt: event.startsAt,
    endsAt: event.endsAt,
    organizerName: user.name,
    organizerUserId: user.id,
    requiresApproval: event.requiresApproval,
  });
  return event;
}

export async function listEvents(user: AuthUser, input: ListEventsInput = {}) {
  assertPermission(user, "events:read");
  const schoolId = resolveSchoolId(user);
  const where: Prisma.EventWhereInput = { schoolId, type: input.type, AND: [visibilityWhere(user)] };
  if (input.status) where.status = input.status;
  if (input.from) where.endsAt = { gte: input.from };
  if (input.to) where.startsAt = { lte: input.to };
  return prisma.event.findMany({ where, include, orderBy: { startsAt: "asc" }, take: 300 });
}

export async function getEvent(user: AuthUser, id: string) {
  assertPermission(user, "events:read");
  const event = await prisma.event.findUnique({ where: { id }, include });
  if (!event) throw AppError.notFound("Event");
  assertSchoolAccess(user, event.schoolId);
  const visible = await prisma.event.findFirst({ where: { id, AND: [visibilityWhere(user)] }, select: { id: true } });
  if (!visible) throw AppError.notFound("Event");
  return event;
}

export async function updateEvent(user: AuthUser, id: string, input: UpdateEventInput) {
  assertPermission(user, "events:manage");
  const before = await getEvent(user, id);
  if (!canManageEvent(user, before)) throw AppError.forbidden("Only the organizer or an administrator can edit this event");
  if (before.status === "CANCELLED") throw AppError.conflict("Event is cancelled");
  const startsAt = input.startsAt ?? before.startsAt;
  const endsAt = input.endsAt ?? before.endsAt;
  if (endsAt <= startsAt) throw AppError.validation("endsAt must be after startsAt");
  if (input.status && before.status === "PENDING_APPROVAL" && !isAdmin(user)) throw AppError.forbidden("Event is awaiting approval");
  const event = await prisma.event.update({
    where: { id },
    data: {
      title: input.title,
      type: input.type,
      description: input.description,
      startsAt: input.startsAt,
      endsAt: input.endsAt,
      location: input.location,
      audience: input.audience,
      requiresApproval: input.requiresApproval,
      status: input.status,
    },
    include,
  });
  await audit({ user, schoolId: before.schoolId, action: "event.update", entityType: "Event", entityId: id, before, after: event });
  return event;
}

export async function cancelEvent(user: AuthUser, id: string) {
  assertPermission(user, "events:manage");
  const before = await getEvent(user, id);
  if (!canManageEvent(user, before)) throw AppError.forbidden("Only the organizer or an administrator can cancel this event");
  if (before.status === "CANCELLED") throw AppError.conflict("Event is already cancelled");
  const event = await prisma.$transaction(async (tx) => {
    await tx.approval.updateMany({ where: { entityType: "Event", entityId: id, status: "PENDING" }, data: { status: "CANCELLED", decisionAt: new Date() } });
    return tx.event.update({ where: { id }, data: { status: "CANCELLED" }, include });
  });
  await audit({ user, schoolId: before.schoolId, action: "event.cancel", entityType: "Event", entityId: id, before, after: event });
  const userIds = event.participants.map((p) => p.userId).filter((uid): uid is string => !!uid && uid !== user.id);
  await notifyMany(userIds, { schoolId: before.schoolId, type: "GENERIC", title: `Event cancelled: ${event.title}`, body: `Was scheduled for ${event.startsAt.toISOString().slice(0, 10)}`, link: `/events/${id}` });
  return event;
}

export async function addEventParticipants(user: AuthUser, id: string, input: AddEventParticipantsInput) {
  assertPermission(user, "events:manage");
  const before = await getEvent(user, id);
  if (!canManageEvent(user, before)) throw AppError.forbidden("Only the organizer or an administrator can add participants");
  if (before.status === "CANCELLED" || before.status === "COMPLETED") throw AppError.conflict(`Event is ${before.status}`);
  const userIds = await assertUsersInSchool(before.schoolId, input.userIds);
  const studentIds = await assertStudentsInSchool(before.schoolId, input.studentIds);
  const existingUsers = new Set(before.participants.map((p) => p.userId).filter(Boolean));
  const existingStudents = new Set(before.participants.map((p) => p.studentId).filter(Boolean));
  const newUsers = userIds.filter((uid) => !existingUsers.has(uid));
  const newStudents = studentIds.filter((sid) => !existingStudents.has(sid));
  if (newUsers.length + newStudents.length > 0) {
    await prisma.eventParticipant.createMany({
      data: [...newUsers.map((userId) => ({ eventId: id, userId, role: input.role })), ...newStudents.map((studentId) => ({ eventId: id, studentId, role: input.role }))],
    });
  }
  const event = await prisma.event.findUniqueOrThrow({ where: { id }, include });
  await audit({ user, schoolId: before.schoolId, action: "event.participants.add", entityType: "Event", entityId: id, metadata: { userIds: newUsers, studentIds: newStudents } });
  if (event.status === "SCHEDULED") {
    for (const uid of newUsers) {
      if (uid === user.id) continue;
      await notify({ schoolId: before.schoolId, userId: uid, type: "EVENT_CREATED", title: `You were added to: ${event.title}`, body: `${event.startsAt.toISOString().slice(0, 10)}${event.location ? ` · ${event.location}` : ""}`, link: `/events/${id}` });
    }
  }
  return event;
}

/** Dashboard helper (no permission check): scheduled events starting in the next `days` days. */
export async function upcomingEvents(schoolId: string, days = 14, now = new Date()) {
  const until = new Date(now.getTime() + days * 86_400_000);
  return prisma.event.findMany({
    where: { schoolId, status: "SCHEDULED", startsAt: { gte: now, lte: until } },
    select: { id: true, title: true, type: true, startsAt: true, endsAt: true, location: true, audience: true },
    orderBy: { startsAt: "asc" },
    take: 20,
  });
}

export function canManageEvents(user: AuthUser) {
  return hasPermission(user, "events:manage");
}
