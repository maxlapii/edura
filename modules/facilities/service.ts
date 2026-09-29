import { prisma } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";
import type { MaintenanceStatus } from "@/generated/prisma/enums";
import type { AuthUser } from "@/lib/auth/types";
import { assertPermission, assertSchoolAccess, hasPermission, resolveSchoolId } from "@/lib/permissions";
import { AppError } from "@/lib/utils/errors";
import { audit } from "@/lib/audit";
import { notify } from "@/lib/notifications";
import { dispatch } from "@/lib/workflows/engine";
import { dayOfWeek, timesOverlap, toDateOnly, todayDateOnly } from "@/lib/utils/dates";
import { maintenanceStaffUserIds } from "@/modules/staff/service";
import { bookingConflicts } from "./booking";
import { canTransition, isOverdue, MAINTENANCE_FINAL_STATUSES } from "./maintenance";
import type {
  AssignMaintenanceInput,
  CreateBookingInput,
  CreateEquipmentInput,
  CreateMaintenanceInput,
  CreateRoomInput,
  ListBookingsQuery,
  ListEquipmentQuery,
  ListMaintenanceQuery,
  ListRoomsQuery,
  MaintenanceStatusChangeInput,
  RoomAvailabilityQuery,
  UpdateEquipmentInput,
  UpdateMaintenanceInput,
  UpdateRoomInput,
} from "./schema";

const roomInclude = {
  responsible: { select: { id: true, name: true, email: true } },
  _count: { select: { equipment: true, timetableSlots: true } },
} satisfies Prisma.RoomInclude;

const bookingInclude = {
  room: { select: { id: true, name: true, code: true, type: true } },
  bookedBy: { select: { id: true, name: true } },
} satisfies Prisma.RoomBookingInclude;

const equipmentInclude = {
  room: { select: { id: true, name: true, code: true } },
} satisfies Prisma.EquipmentInclude;

const maintenanceInclude = {
  room: { select: { id: true, name: true, code: true } },
  reportedBy: { select: { id: true, name: true, email: true } },
  assignedTo: { select: { id: true, name: true, email: true } },
} satisfies Prisma.MaintenanceRequestInclude;

const slotUsageInclude = {
  period: true,
  course: { include: { subject: { select: { id: true, name: true } }, class: { select: { id: true, name: true } } } },
  teacher: { include: { user: { select: { id: true, name: true } } } },
} satisfies Prisma.TimetableSlotInclude;

// ───────────── Rooms ─────────────

async function loadRoom(user: AuthUser, id: string) {
  const room = await prisma.room.findUnique({ where: { id } });
  if (!room) throw AppError.notFound("Room");
  assertSchoolAccess(user, room.schoolId);
  return room;
}

async function validateResponsible(schoolId: string, userId?: string | null) {
  if (!userId) return;
  const u = await prisma.user.findUnique({ where: { id: userId }, select: { schoolId: true } });
  if (!u || u.schoolId !== schoolId) throw AppError.validation("Responsible user must belong to the same school");
}

export async function listRooms(user: AuthUser, query: ListRoomsQuery = {}) {
  assertPermission(user, "rooms:read");
  const schoolId = resolveSchoolId(user, query.schoolId);
  const where: Prisma.RoomWhereInput = {
    schoolId,
    type: query.type,
    isActive: query.isActive === undefined ? undefined : query.isActive === "true",
  };
  return prisma.room.findMany({ where, include: roomInclude, orderBy: [{ building: "asc" }, { name: "asc" }] });
}

/** Room detail with today's timetable usage and upcoming confirmed bookings. */
export async function getRoom(user: AuthUser, id: string, now: Date = new Date()) {
  assertPermission(user, "rooms:read");
  const room = await prisma.room.findUnique({ where: { id }, include: { ...roomInclude, equipment: { orderBy: { name: "asc" } } } });
  if (!room) throw AppError.notFound("Room");
  assertSchoolAccess(user, room.schoolId);
  const today = toDateOnly(now);
  const [todaySlots, upcomingBookings] = await Promise.all([
    prisma.timetableSlot.findMany({ where: { roomId: id, dayOfWeek: dayOfWeek(now) }, include: slotUsageInclude, orderBy: { period: { order: "asc" } } }),
    prisma.roomBooking.findMany({ where: { roomId: id, status: "CONFIRMED", date: { gte: today } }, include: bookingInclude, orderBy: [{ date: "asc" }, { startTime: "asc" }], take: 50 }),
  ]);
  return { ...room, todaySlots, upcomingBookings };
}

export async function createRoom(user: AuthUser, input: CreateRoomInput) {
  assertPermission(user, "rooms:manage");
  const schoolId = resolveSchoolId(user, input.schoolId);
  await validateResponsible(schoolId, input.responsibleUserId);
  const room = await prisma.room.create({
    data: {
      schoolId,
      name: input.name,
      code: input.code,
      type: input.type,
      capacity: input.capacity ?? null,
      building: input.building ?? null,
      responsibleUserId: input.responsibleUserId ?? null,
      isActive: input.isActive,
    },
    include: roomInclude,
  });
  await audit({ user, schoolId, action: "room.create", entityType: "Room", entityId: room.id, after: room });
  return room;
}

export async function updateRoom(user: AuthUser, id: string, input: UpdateRoomInput) {
  assertPermission(user, "rooms:manage");
  const before = await loadRoom(user, id);
  await validateResponsible(before.schoolId, input.responsibleUserId);
  const room = await prisma.room.update({ where: { id }, data: input, include: roomInclude });
  await audit({ user, schoolId: before.schoolId, action: "room.update", entityType: "Room", entityId: id, before, after: room });
  return room;
}

/** Rooms are never hard-deleted (timetable/bookings reference them); they are deactivated. */
export async function deactivateRoom(user: AuthUser, id: string) {
  assertPermission(user, "rooms:manage");
  const before = await loadRoom(user, id);
  const room = await prisma.room.update({ where: { id }, data: { isActive: false }, include: roomInclude });
  await audit({ user, schoolId: before.schoolId, action: "room.deactivate", entityType: "Room", entityId: id, before, after: room });
  return room;
}

/**
 * For each period of the school day, which active rooms are free on `date`:
 * no timetable slot on that weekday/period and no CONFIRMED booking overlapping the period's time range.
 */
export async function roomAvailability(user: AuthUser, query: RoomAvailabilityQuery = {}) {
  assertPermission(user, "rooms:read");
  const schoolId = resolveSchoolId(user);
  const date = query.date ? toDateOnly(query.date) : todayDateOnly();
  const dow = dayOfWeek(date);
  const [periods, rooms, slots, bookings] = await Promise.all([
    prisma.period.findMany({ where: { schoolId }, orderBy: { order: "asc" } }),
    prisma.room.findMany({ where: { schoolId, isActive: true }, select: { id: true, name: true, code: true, type: true, capacity: true, building: true }, orderBy: [{ building: "asc" }, { name: "asc" }] }),
    prisma.timetableSlot.findMany({ where: { schoolId, dayOfWeek: dow, roomId: { not: null } }, select: { roomId: true, periodId: true } }),
    prisma.roomBooking.findMany({ where: { schoolId, date, status: "CONFIRMED" }, select: { roomId: true, startTime: true, endTime: true } }),
  ]);
  const occupied = new Set(slots.map((s) => `${s.roomId}:${s.periodId}`));
  const bookingsByRoom = new Map<string, Array<{ startTime: string; endTime: string }>>();
  for (const b of bookings) {
    const list = bookingsByRoom.get(b.roomId) ?? [];
    list.push(b);
    bookingsByRoom.set(b.roomId, list);
  }
  return {
    date,
    dayOfWeek: dow,
    periods,
    rooms: rooms.map((room) => ({
      room,
      free: periods
        .filter((p) => !occupied.has(`${room.id}:${p.id}`))
        .filter((p) => !(bookingsByRoom.get(room.id) ?? []).some((b) => timesOverlap(p.startTime, p.endTime, b.startTime, b.endTime)))
        .map((p) => p.id),
    })),
  };
}

// ───────────── Bookings ─────────────

export async function createBooking(user: AuthUser, input: CreateBookingInput) {
  assertPermission(user, "rooms:book");
  const schoolId = resolveSchoolId(user);
  const room = await prisma.room.findUnique({ where: { id: input.roomId } });
  if (!room || room.schoolId !== schoolId) throw AppError.validation("Room must belong to the same school");
  if (!room.isActive) throw AppError.validation("Room is not active");
  if (input.startTime >= input.endTime) throw AppError.validation("startTime must be before endTime");
  const date = toDateOnly(input.date);
  const [existing, slots] = await Promise.all([
    prisma.roomBooking.findMany({ where: { roomId: room.id, date, status: "CONFIRMED" } }),
    prisma.timetableSlot.findMany({ where: { roomId: room.id, dayOfWeek: dayOfWeek(date) }, include: { period: true, course: { include: { subject: { select: { name: true } }, class: { select: { name: true } } } } } }),
  ]);
  const conflicts = bookingConflicts(
    { roomId: room.id, date, startTime: input.startTime, endTime: input.endTime },
    existing,
    slots.map((s) => ({ periodStart: s.period.startTime, periodEnd: s.period.endTime, label: `${s.course.subject.name} – ${s.course.class.name}` })),
  );
  if (conflicts.length) throw AppError.conflict("Room is not available at the requested time", conflicts);
  const booking = await prisma.roomBooking.create({
    data: { schoolId, roomId: room.id, bookedByUserId: user.id, date, startTime: input.startTime, endTime: input.endTime, purpose: input.purpose ?? null },
    include: bookingInclude,
  });
  await audit({ user, schoolId, action: "room.booking.create", entityType: "RoomBooking", entityId: booking.id, after: booking });
  return booking;
}

export async function cancelBooking(user: AuthUser, id: string) {
  assertPermission(user, "rooms:book");
  const before = await prisma.roomBooking.findUnique({ where: { id } });
  if (!before) throw AppError.notFound("Booking");
  assertSchoolAccess(user, before.schoolId);
  if (before.bookedByUserId !== user.id && !hasPermission(user, "rooms:manage")) throw AppError.forbidden("Only the booker or a facilities manager can cancel this booking");
  if (before.status === "CANCELLED") return prisma.roomBooking.findUniqueOrThrow({ where: { id }, include: bookingInclude });
  const booking = await prisma.roomBooking.update({ where: { id }, data: { status: "CANCELLED" }, include: bookingInclude });
  await audit({ user, schoolId: before.schoolId, action: "room.booking.cancel", entityType: "RoomBooking", entityId: id, before, after: booking });
  return booking;
}

/** Managers see every booking; others see their own bookings plus the bookings of a specific room when `roomId` is given. */
export async function listBookings(user: AuthUser, query: ListBookingsQuery = {}) {
  assertPermission(user, "rooms:read");
  const schoolId = resolveSchoolId(user);
  const where: Prisma.RoomBookingWhereInput = {
    schoolId,
    roomId: query.roomId,
    status: query.status ?? "CONFIRMED",
    date: query.from || query.to ? { gte: query.from ? toDateOnly(query.from) : undefined, lte: query.to ? toDateOnly(query.to) : undefined } : undefined,
  };
  if (!hasPermission(user, "rooms:manage")) {
    where.OR = [{ bookedByUserId: user.id }, ...(query.roomId ? [{ roomId: query.roomId }] : [])];
  }
  return prisma.roomBooking.findMany({ where, include: bookingInclude, orderBy: [{ date: "asc" }, { startTime: "asc" }], take: 500 });
}

// ───────────── Equipment ─────────────

async function validateRoomRef(schoolId: string, roomId?: string | null) {
  if (!roomId) return;
  const r = await prisma.room.findUnique({ where: { id: roomId }, select: { schoolId: true } });
  if (!r || r.schoolId !== schoolId) throw AppError.validation("Room must belong to the same school");
}

export async function listEquipment(user: AuthUser, query: ListEquipmentQuery = {}) {
  assertPermission(user, "rooms:read");
  const schoolId = resolveSchoolId(user);
  return prisma.equipment.findMany({ where: { schoolId, roomId: query.roomId, status: query.status }, include: equipmentInclude, orderBy: { name: "asc" } });
}

export async function createEquipment(user: AuthUser, input: CreateEquipmentInput) {
  assertPermission(user, "rooms:manage");
  const schoolId = resolveSchoolId(user);
  await validateRoomRef(schoolId, input.roomId);
  const item = await prisma.equipment.create({
    data: { schoolId, name: input.name, roomId: input.roomId ?? null, quantity: input.quantity, status: input.status, notes: input.notes ?? null },
    include: equipmentInclude,
  });
  await audit({ user, schoolId, action: "equipment.create", entityType: "Equipment", entityId: item.id, after: item });
  return item;
}

export async function updateEquipment(user: AuthUser, id: string, input: UpdateEquipmentInput) {
  assertPermission(user, "rooms:manage");
  const before = await prisma.equipment.findUnique({ where: { id } });
  if (!before) throw AppError.notFound("Equipment");
  assertSchoolAccess(user, before.schoolId);
  await validateRoomRef(before.schoolId, input.roomId);
  const item = await prisma.equipment.update({ where: { id }, data: input, include: equipmentInclude });
  await audit({ user, schoolId: before.schoolId, action: "equipment.update", entityType: "Equipment", entityId: id, before, after: item });
  return item;
}

export async function deleteEquipment(user: AuthUser, id: string) {
  assertPermission(user, "rooms:manage");
  const before = await prisma.equipment.findUnique({ where: { id } });
  if (!before) throw AppError.notFound("Equipment");
  assertSchoolAccess(user, before.schoolId);
  await prisma.equipment.delete({ where: { id } });
  await audit({ user, schoolId: before.schoolId, action: "equipment.delete", entityType: "Equipment", entityId: id, before });
}

// ───────────── Maintenance ─────────────

function canManageMaintenance(user: AuthUser) {
  return hasPermission(user, "maintenance:manage");
}

async function loadRequest(user: AuthUser, id: string) {
  const req = await prisma.maintenanceRequest.findUnique({ where: { id }, include: maintenanceInclude });
  if (!req) throw AppError.notFound("Maintenance request");
  assertSchoolAccess(user, req.schoolId);
  return req;
}

export async function createRequest(user: AuthUser, input: CreateMaintenanceInput) {
  assertPermission(user, "maintenance:report");
  const schoolId = resolveSchoolId(user);
  await validateRoomRef(schoolId, input.roomId);
  const req = await prisma.maintenanceRequest.create({
    data: {
      schoolId,
      title: input.title,
      category: input.category,
      description: input.description ?? null,
      roomId: input.roomId ?? null,
      reportedByUserId: user.id,
      priority: input.priority,
      dueDate: input.dueDate ?? null,
    },
    include: maintenanceInclude,
  });
  await audit({ user, schoolId, action: "maintenance.create", entityType: "MaintenanceRequest", entityId: req.id, after: req });
  await dispatch("MAINTENANCE_CREATED", schoolId, {
    sourceId: req.id,
    maintenanceRequestId: req.id,
    title: req.title,
    category: req.category,
    priority: req.priority,
    roomName: req.room?.name ?? null,
    reporterName: req.reportedBy.name,
    reporterUserId: user.id,
    maintenanceStaffUserIds: await maintenanceStaffUserIds(schoolId),
  });
  return req;
}

export async function assignRequest(user: AuthUser, id: string, input: AssignMaintenanceInput) {
  assertPermission(user, "maintenance:manage");
  const before = await loadRequest(user, id);
  const assignee = await prisma.user.findUnique({ where: { id: input.assignedToUserId }, select: { id: true, schoolId: true, isActive: true } });
  if (!assignee || assignee.schoolId !== before.schoolId || !assignee.isActive) throw AppError.validation("Assignee must be an active user of the same school");
  if (before.status !== "ASSIGNED" && !canTransition(before.status, "ASSIGNED")) {
    throw AppError.validation(`Cannot assign a request in status ${before.status}`);
  }
  const req = await prisma.maintenanceRequest.update({ where: { id }, data: { assignedToUserId: assignee.id, status: "ASSIGNED" }, include: maintenanceInclude });
  await audit({ user, schoolId: before.schoolId, action: "maintenance.assign", entityType: "MaintenanceRequest", entityId: id, before, after: req });
  if (before.assignedToUserId !== assignee.id) {
    await notify({
      schoolId: before.schoolId,
      userId: assignee.id,
      type: "MAINTENANCE_ASSIGNED",
      title: `Maintenance request assigned: ${req.title}`,
      body: `${req.category} – priority ${req.priority}${req.room ? ` – ${req.room.name}` : ""}`,
      link: `/maintenance/${req.id}`,
    });
  }
  return req;
}

/** Managers or the current assignee may move the request through the state machine. */
export async function updateStatus(user: AuthUser, id: string, input: MaintenanceStatusChangeInput) {
  const before = await loadRequest(user, id);
  if (!canManageMaintenance(user) && before.assignedToUserId !== user.id) throw AppError.forbidden("Only facilities managers or the assignee can change the status");
  if (!canTransition(before.status, input.status)) throw AppError.validation(`Cannot change status from ${before.status} to ${input.status}`);
  const now = new Date();
  const data: Prisma.MaintenanceRequestUpdateInput = { status: input.status };
  if (input.resolutionNote !== undefined) data.resolutionNote = input.resolutionNote;
  if (input.status === "RESOLVED") data.resolvedAt = now;
  if (input.status === "CLOSED") {
    data.closedAt = now;
    if (!before.resolvedAt) data.resolvedAt = now;
  }
  if (!MAINTENANCE_FINAL_STATUSES.includes(input.status)) {
    data.resolvedAt = null;
    data.closedAt = null;
  }
  const req = await prisma.maintenanceRequest.update({ where: { id }, data, include: maintenanceInclude });
  await audit({ user, schoolId: before.schoolId, action: "maintenance.status", entityType: "MaintenanceRequest", entityId: id, before, after: req, metadata: { from: before.status, to: input.status } });
  return req;
}

/** Managers may edit any field; reporters may edit their own request while it is still OPEN. */
export async function updateRequest(user: AuthUser, id: string, input: UpdateMaintenanceInput) {
  const before = await loadRequest(user, id);
  if (!canManageMaintenance(user)) {
    if (before.reportedByUserId !== user.id) throw AppError.forbidden();
    if (before.status !== "OPEN") throw AppError.forbidden("Only open requests can be edited by the reporter");
  }
  await validateRoomRef(before.schoolId, input.roomId);
  const req = await prisma.maintenanceRequest.update({ where: { id }, data: input, include: maintenanceInclude });
  await audit({ user, schoolId: before.schoolId, action: "maintenance.update", entityType: "MaintenanceRequest", entityId: id, before, after: req });
  return req;
}

export async function listRequests(user: AuthUser, query: ListMaintenanceQuery = {}) {
  assertPermission(user, "maintenance:report");
  const schoolId = resolveSchoolId(user);
  const where: Prisma.MaintenanceRequestWhereInput = { schoolId, status: query.status, priority: query.priority, assignedToUserId: query.assignedToUserId };
  if (query.mine === "true") where.reportedByUserId = user.id;
  if (!canManageMaintenance(user)) where.OR = [{ reportedByUserId: user.id }, { assignedToUserId: user.id }];
  const items = await prisma.maintenanceRequest.findMany({ where, include: maintenanceInclude, orderBy: [{ status: "asc" }, { priority: "desc" }, { createdAt: "desc" }], take: 500 });
  const now = new Date();
  return items.map((r) => ({ ...r, overdue: isOverdue(r, now) }));
}

export async function getRequest(user: AuthUser, id: string) {
  assertPermission(user, "maintenance:report");
  const req = await loadRequest(user, id);
  if (!canManageMaintenance(user) && req.reportedByUserId !== user.id && req.assignedToUserId !== user.id) throw AppError.forbidden();
  return { ...req, overdue: isOverdue(req) };
}

/** Operational summary for the admin/facilities dashboard. */
export async function maintenanceDashboard(schoolId: string, now: Date = new Date()) {
  const activeStatuses: MaintenanceStatus[] = ["OPEN", "ASSIGNED", "IN_PROGRESS"];
  const [open, highPriority, assigned, inProgress, overdue, recentlyResolved] = await Promise.all([
    prisma.maintenanceRequest.count({ where: { schoolId, status: "OPEN" } }),
    prisma.maintenanceRequest.count({ where: { schoolId, status: { in: activeStatuses }, priority: { in: ["HIGH", "URGENT"] } } }),
    prisma.maintenanceRequest.count({ where: { schoolId, status: "ASSIGNED" } }),
    prisma.maintenanceRequest.count({ where: { schoolId, status: "IN_PROGRESS" } }),
    prisma.maintenanceRequest.findMany({ where: { schoolId, status: { in: activeStatuses }, dueDate: { lt: now } }, include: maintenanceInclude, orderBy: { dueDate: "asc" } }),
    prisma.maintenanceRequest.findMany({ where: { schoolId, status: { in: ["RESOLVED", "CLOSED"] } }, include: maintenanceInclude, orderBy: { resolvedAt: "desc" }, take: 10 }),
  ]);
  return { open, highPriority, assigned, inProgress, overdueCount: overdue.length, overdue, recentlyResolved };
}

export async function getMaintenanceDashboard(user: AuthUser, schoolId?: string) {
  assertPermission(user, "maintenance:manage");
  return maintenanceDashboard(resolveSchoolId(user, schoolId));
}
