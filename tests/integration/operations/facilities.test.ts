import { describe, expect, it } from "vitest";
import { createSchoolFixture, createOtherSchool, createUser, asUser, signIn, api, prisma } from "../helpers";
import {
  assignRequest,
  cancelBooking,
  createBooking,
  createEquipment,
  createRequest,
  createRoom,
  deactivateRoom,
  deleteEquipment,
  getMaintenanceDashboard,
  getRequest,
  getRoom,
  listBookings,
  listEquipment,
  listRequests,
  listRooms,
  maintenanceDashboard,
  roomAvailability,
  updateEquipment,
  updateRequest,
  updateRoom,
  updateStatus,
} from "@/modules/facilities/service";
import { POST as postRoom, GET as getRooms } from "@/app/api/rooms/route";
import { PATCH as patchRoom, DELETE as deleteRoomRoute } from "@/app/api/rooms/[id]/route";
import { POST as postBooking, GET as getBookings } from "@/app/api/rooms/bookings/route";
import { DELETE as deleteBookingRoute } from "@/app/api/rooms/bookings/[id]/route";
import { POST as postEquipment } from "@/app/api/equipment/route";
import { PATCH as patchEquipment, DELETE as deleteEquipmentRoute } from "@/app/api/equipment/[id]/route";
import { POST as postMaintenance, GET as getMaintenance } from "@/app/api/maintenance/route";
import { POST as assignRoute } from "@/app/api/maintenance/[id]/assign/route";
import { POST as statusRoute } from "@/app/api/maintenance/[id]/status/route";
import { GET as maintenanceDashboardRoute } from "@/app/api/maintenance/dashboard/route";
import { toDateOnly } from "@/lib/utils/dates";

const MONDAY = toDateOnly("2026-10-05");
const DAY = 86_400_000;

async function createMaintenanceStaff(schoolId: string) {
  const user = await createUser("STAFF", schoolId, { name: "Fix It" });
  const staff = await prisma.staff.create({ data: { schoolId, userId: user.id, employeeNumber: `M-${user.id.slice(-6)}`, staffType: "MAINTENANCE", position: "Caretaker" } });
  return { user, staff, auth: await asUser(user.id) };
}

describe("facilities: rooms", () => {
  it("rooms CRUD through the API; room codes are unique per school (409)", async () => {
    const f = await createSchoolFixture();
    const cookie = await signIn(f.adminUser.email);
    const created = await api(postRoom, { cookie, body: { name: "Physics lab", code: "LAB1", type: "LAB", capacity: 24, building: "B", responsibleUserId: f.teacher.user.id } });
    expect(created.status).toBe(201);
    const room = created.data as { id: string; code: string; type: string; responsible: { id: string }; _count: { equipment: number; timetableSlots: number } };
    expect(room).toMatchObject({ code: "LAB1", type: "LAB", responsible: { id: f.teacher.user.id }, _count: { equipment: 0, timetableSlots: 0 } });

    const dup = await api(postRoom, { cookie, body: { name: "Duplicate", code: "R1" } });
    expect(dup.status).toBe(409);
    expect(dup.error?.code).toBe("CONFLICT");
    // same code in another school is fine
    const other = await createOtherSchool();
    expect((await createRoom(other.admin, { name: "Their R1", code: "R1", type: "CLASSROOM", isActive: true })).code).toBe("R1");
    expect((await listRooms(other.admin)).map((r) => r.code)).toEqual(["R1"]);

    // teachers can read but not manage
    expect((await api(postRoom, { cookie: await signIn(f.teacher.user.email), body: { name: "x", code: "T" } })).status).toBe(403);
    const list = await api(getRooms, { cookie: await signIn(f.teacher.user.email), query: { type: "LAB" } });
    expect(list.status).toBe(200);
    expect((list.data as Array<{ id: string }>).map((r) => r.id)).toEqual([room.id]);

    const patched = await api(patchRoom, { cookie, method: "PATCH", params: { id: room.id }, body: { capacity: 30, name: "Physics lab 2" } });
    expect(patched.status).toBe(200);
    expect(patched.data).toMatchObject({ capacity: 30, name: "Physics lab 2" });
    await expect(updateRoom(f.admin, room.id, { responsibleUserId: other.teacher.user.id })).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    await expect(updateRoom(other.admin, room.id, { name: "Hijack" })).rejects.toMatchObject({ code: "FORBIDDEN" });

    const detail = await getRoom(f.admin, f.room.id, new Date("2026-10-05T09:00:00Z"));
    expect(detail.todaySlots).toHaveLength(1);
    expect(detail.todaySlots[0].dayOfWeek).toBe(1);
    expect(detail.upcomingBookings).toEqual([]);

    const deactivated = await api(deleteRoomRoute, { cookie, method: "DELETE", params: { id: room.id } });
    expect(deactivated.status).toBe(200);
    expect(deactivated.data).toMatchObject({ isActive: false });
    expect((await listRooms(f.admin, { isActive: "false" })).map((r) => r.id)).toEqual([room.id]);
    expect((await listRooms(f.admin, { isActive: "true" })).map((r) => r.id)).toEqual([f.room.id]);
    expect(await prisma.auditLog.count({ where: { entityType: "Room", entityId: room.id } })).toBe(3);
    await expect(deactivateRoom(f.admin, "missing")).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("roomAvailability marks a room busy for a timetabled period and for confirmed bookings", async () => {
    const f = await createSchoolFixture();
    const free = await createRoom(f.admin, { name: "Free room", code: "FREE", type: "MEETING", isActive: true });
    await createRoom(f.admin, { name: "Closed", code: "CLOSED", type: "OTHER", isActive: false });
    const periodIds = f.periods.map((p) => p.id);

    const monday = await roomAvailability(f.teacher.auth, { date: MONDAY });
    expect(monday.dayOfWeek).toBe(1);
    expect(monday.periods).toHaveLength(8);
    expect(monday.rooms.map((r) => r.room.code).sort()).toEqual(["FREE", "R1"]);
    const r1 = monday.rooms.find((r) => r.room.id === f.room.id)!;
    expect(r1.free).toEqual(periodIds.slice(1)); // period 1 is timetabled every day
    expect(monday.rooms.find((r) => r.room.id === free.id)!.free).toEqual(periodIds);

    // a confirmed booking 09:00–10:00 blocks periods 2 (08:50–09:35) and 3 (09:40–10:25) of the free room on that date only
    await createBooking(f.teacher.auth, { roomId: free.id, date: MONDAY, startTime: "09:00", endTime: "10:00", purpose: "Tutoring" });
    const cancelled = await createBooking(f.teacher.auth, { roomId: free.id, date: MONDAY, startTime: "13:10", endTime: "13:55" });
    await cancelBooking(f.teacher.auth, cancelled.id);
    const booked = await roomAvailability(f.admin, { date: MONDAY });
    const freeRoom = booked.rooms.find((r) => r.room.id === free.id)!;
    expect(freeRoom.free).toEqual(periodIds.filter((_, i) => i !== 1 && i !== 2));
    const tuesday = await roomAvailability(f.admin, { date: toDateOnly("2026-10-06") });
    expect(tuesday.rooms.find((r) => r.room.id === free.id)!.free).toEqual(periodIds);
    // other school sees only its own rooms
    const other = await createOtherSchool();
    expect((await roomAvailability(other.admin, { date: MONDAY })).rooms).toEqual([]);
  });
});

describe("facilities: bookings", () => {
  it("detects conflicts with confirmed bookings and with timetabled lessons in the room", async () => {
    const f = await createSchoolFixture();
    const room = await createRoom(f.admin, { name: "Seminar", code: "SEM", type: "MEETING", isActive: true });
    const cookie = await signIn(f.teacher.user.email);
    const first = await api(postBooking, { cookie, body: { roomId: room.id, date: "2026-10-05", startTime: "10:00", endTime: "11:00", purpose: "Parents" } });
    expect(first.status).toBe(201);
    expect(first.data).toMatchObject({ roomId: room.id, status: "CONFIRMED", bookedBy: { id: f.teacher.user.id }, startTime: "10:00", endTime: "11:00" });

    const overlap = await api(postBooking, { cookie: await signIn(f.teacher2.user.email), body: { roomId: room.id, date: "2026-10-05", startTime: "10:30", endTime: "11:30" } });
    expect(overlap.status).toBe(409);
    expect(overlap.error?.code).toBe("CONFLICT");
    expect(overlap.error?.details).toEqual([{ type: "BOOKING", bookingId: (first.data as { id: string }).id, message: "Room is already booked 10:00–11:00 (Parents)" }]);

    // adjacent (11:00–12:00) and other-day bookings are fine
    expect((await createBooking(f.teacher2.auth, { roomId: room.id, date: MONDAY, startTime: "11:00", endTime: "12:00" })).status).toBe("CONFIRMED");
    expect((await createBooking(f.teacher2.auth, { roomId: room.id, date: toDateOnly("2026-10-06"), startTime: "10:00", endTime: "11:00" })).status).toBe("CONFIRMED");

    // Room 1 has a lesson in period 1 (08:00–08:45) on every weekday
    await expect(createBooking(f.teacher.auth, { roomId: f.room.id, date: MONDAY, startTime: "08:30", endTime: "09:00" })).rejects.toMatchObject({
      code: "CONFLICT",
      details: [{ type: "TIMETABLE", message: "A lesson is timetabled in this room 08:00–08:45 (Mathematics – 10A)" }],
    });
    expect((await createBooking(f.teacher.auth, { roomId: f.room.id, date: MONDAY, startTime: "09:00", endTime: "09:30" })).status).toBe("CONFIRMED");

    // validation
    const backwards = await api(postBooking, { cookie, body: { roomId: room.id, date: "2026-10-05", startTime: "12:00", endTime: "11:00" } });
    expect(backwards.status).toBe(422);
    const other = await createOtherSchool();
    const otherRoom = await prisma.room.create({ data: { schoolId: other.school.id, name: "Theirs", code: "T1" } });
    await expect(createBooking(f.teacher.auth, { roomId: otherRoom.id, date: MONDAY, startTime: "10:00", endTime: "11:00" })).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    await deactivateRoom(f.admin, room.id);
    await expect(createBooking(f.teacher.auth, { roomId: room.id, date: toDateOnly("2026-10-07"), startTime: "10:00", endTime: "11:00" })).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    // students cannot book
    await expect(createBooking(f.students[0].auth!, { roomId: room.id, date: MONDAY, startTime: "10:00", endTime: "11:00" })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("only the booker or a facilities manager can cancel; lists are scoped", async () => {
    const f = await createSchoolFixture();
    const room = await createRoom(f.admin, { name: "Seminar", code: "SEM", type: "MEETING", isActive: true });
    const mine = await createBooking(f.teacher.auth, { roomId: room.id, date: MONDAY, startTime: "10:00", endTime: "11:00" });
    const theirs = await createBooking(f.teacher2.auth, { roomId: room.id, date: MONDAY, startTime: "12:00", endTime: "13:00" });
    const elsewhere = await createBooking(f.teacher2.auth, { roomId: f.room.id, date: MONDAY, startTime: "12:00", endTime: "13:00" });

    // scoping: non-managers see their own bookings, plus a room's bookings when asking for that room
    expect((await listBookings(f.teacher.auth)).map((b) => b.id)).toEqual([mine.id]);
    expect((await listBookings(f.teacher.auth, { roomId: room.id })).map((b) => b.id).sort()).toEqual([mine.id, theirs.id].sort());
    expect((await listBookings(f.teacher.auth, { roomId: f.room.id })).map((b) => b.id)).toEqual([elsewhere.id]);
    expect((await listBookings(f.admin)).map((b) => b.id).sort()).toEqual([mine.id, theirs.id, elsewhere.id].sort());
    expect(await listBookings(f.admin, { from: toDateOnly("2026-10-06") })).toEqual([]);
    expect((await listBookings(f.admin, { from: MONDAY, to: MONDAY })).length).toBe(3);
    const viaRoute = await api(getBookings, { cookie: await signIn(f.teacher2.user.email) });
    expect(viaRoute.status).toBe(200);
    expect((viaRoute.data as Array<{ id: string }>).map((b) => b.id).sort()).toEqual([theirs.id, elsewhere.id].sort());

    const forbidden = await api(deleteBookingRoute, { cookie: await signIn(f.teacher2.user.email), method: "DELETE", params: { id: mine.id } });
    expect(forbidden.status).toBe(403);
    const own = await api(deleteBookingRoute, { cookie: await signIn(f.teacher.user.email), method: "DELETE", params: { id: mine.id } });
    expect(own.status).toBe(200);
    expect(own.data).toMatchObject({ id: mine.id, status: "CANCELLED" });
    expect((await cancelBooking(f.admin, theirs.id)).status).toBe("CANCELLED");
    // cancelling again is a no-op
    expect((await cancelBooking(f.teacher.auth, mine.id)).status).toBe("CANCELLED");
    expect(await prisma.auditLog.count({ where: { action: "room.booking.cancel" } })).toBe(2);
    expect((await listBookings(f.admin, { status: "CANCELLED" })).length).toBe(2);
    expect((await listBookings(f.admin)).map((b) => b.id)).toEqual([elsewhere.id]);
    // the slot is free again
    expect((await createBooking(f.teacher2.auth, { roomId: room.id, date: MONDAY, startTime: "10:00", endTime: "11:00" })).status).toBe("CONFIRMED");
    const other = await createOtherSchool();
    await expect(cancelBooking(other.admin, elsewhere.id)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

describe("facilities: equipment", () => {
  it("equipment CRUD is restricted to facilities managers and the school", async () => {
    const f = await createSchoolFixture();
    const cookie = await signIn(f.adminUser.email);
    const created = await api(postEquipment, { cookie, body: { name: "Projector", roomId: f.room.id, quantity: 2, status: "OK" } });
    expect(created.status).toBe(201);
    const item = created.data as { id: string; room: { id: string } };
    expect(item.room.id).toBe(f.room.id);
    const loose = await createEquipment(f.admin, { name: "Laptop cart", quantity: 1, status: "OK" });
    expect(loose.roomId).toBeNull();

    const other = await createOtherSchool();
    const otherRoom = await prisma.room.create({ data: { schoolId: other.school.id, name: "Theirs", code: "T1" } });
    await expect(createEquipment(f.admin, { name: "x", roomId: otherRoom.id, quantity: 1, status: "OK" })).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    await expect(createEquipment(f.teacher.auth, { name: "x", quantity: 1, status: "OK" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect((await api(postEquipment, { cookie: await signIn(f.teacher.user.email), body: { name: "x" } })).status).toBe(403);

    expect((await listEquipment(f.teacher.auth)).map((e) => e.name)).toEqual(["Laptop cart", "Projector"]);
    expect((await listEquipment(f.teacher.auth, { roomId: f.room.id })).map((e) => e.id)).toEqual([item.id]);
    expect(await listEquipment(other.admin)).toEqual([]);

    const patched = await api(patchEquipment, { cookie, method: "PATCH", params: { id: item.id }, body: { status: "BROKEN", notes: "Lamp dead" } });
    expect(patched.status).toBe(200);
    expect(patched.data).toMatchObject({ status: "BROKEN", notes: "Lamp dead" });
    expect((await listEquipment(f.admin, { status: "BROKEN" })).map((e) => e.id)).toEqual([item.id]);
    await expect(updateEquipment(other.admin, item.id, { status: "OK" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(updateEquipment(f.admin, item.id, { roomId: otherRoom.id })).rejects.toMatchObject({ code: "VALIDATION_ERROR" });

    await expect(deleteEquipment(other.admin, item.id)).rejects.toMatchObject({ code: "FORBIDDEN" });
    const deleted = await api(deleteEquipmentRoute, { cookie, method: "DELETE", params: { id: item.id } });
    expect(deleted.status).toBe(204);
    expect(await prisma.equipment.count()).toBe(1);
    await expect(deleteEquipment(f.admin, item.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(await prisma.auditLog.count({ where: { entityType: "Equipment" } })).toBe(4);
  });
});

describe("facilities: maintenance", () => {
  it("a teacher reports a request: MAINTENANCE_CREATED run, maintenance staff and admins notified", async () => {
    const f = await createSchoolFixture();
    const fixer = await createMaintenanceStaff(f.school.id);
    const otherStaff = await createUser("STAFF", f.school.id);
    await prisma.staff.create({ data: { schoolId: f.school.id, userId: otherStaff.id, employeeNumber: "IT-1", staffType: "IT" } });
    const res = await api(postMaintenance, { cookie: await signIn(f.teacher.user.email), body: { title: "Projector broken", category: "PROJECTOR", roomId: f.room.id, priority: "HIGH", description: "No image" } });
    expect(res.status).toBe(201);
    const req = res.data as { id: string; status: string; reportedBy: { id: string }; room: { id: string } };
    expect(req).toMatchObject({ status: "OPEN", reportedBy: { id: f.teacher.user.id }, room: { id: f.room.id } });

    const runs = await prisma.workflowRun.findMany({ where: { schoolId: f.school.id, trigger: "MAINTENANCE_CREATED" } });
    expect(runs).toHaveLength(1);
    expect(runs[0].status).toBe("SUCCESS");
    expect(runs[0].payload).toMatchObject({ maintenanceRequestId: req.id, title: "Projector broken", category: "PROJECTOR", priority: "HIGH", roomName: "Room 1", reporterUserId: f.teacher.user.id, maintenanceStaffUserIds: [fixer.user.id] });
    const notes = await prisma.notification.findMany({ where: { type: "MAINTENANCE_CREATED" } });
    expect(notes.map((n) => n.userId).sort()).toEqual([fixer.user.id, f.adminUser.id, f.principal.id].sort());
    expect(notes[0]).toMatchObject({ title: "New maintenance request: Projector broken", body: "PROJECTOR – priority HIGH", link: `/maintenance/${req.id}` });

    const other = await createOtherSchool();
    const otherRoom = await prisma.room.create({ data: { schoolId: other.school.id, name: "Theirs", code: "T1" } });
    await expect(createRequest(f.teacher.auth, { title: "x", category: "OTHER", roomId: otherRoom.id, priority: "NORMAL" })).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    await expect(createRequest(f.students[0].auth!, { title: "x", category: "OTHER", priority: "NORMAL" })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("assigning sets ASSIGNED and notifies the assignee; status transitions follow the state machine", async () => {
    const f = await createSchoolFixture();
    const fixer = await createMaintenanceStaff(f.school.id);
    const req = await createRequest(f.teacher.auth, { title: "AC leaking", category: "AIR_CONDITIONING", priority: "URGENT" });
    await prisma.notification.deleteMany({});

    expect((await api(assignRoute, { cookie: await signIn(f.teacher.user.email), params: { id: req.id }, body: { assignedToUserId: fixer.user.id } })).status).toBe(403);
    const other = await createOtherSchool();
    await expect(assignRequest(f.admin, req.id, { assignedToUserId: other.teacher.user.id })).rejects.toMatchObject({ code: "VALIDATION_ERROR" });

    const assigned = await api(assignRoute, { cookie: await signIn(f.adminUser.email), params: { id: req.id }, body: { assignedToUserId: fixer.user.id } });
    expect(assigned.status).toBe(200);
    expect(assigned.data).toMatchObject({ status: "ASSIGNED", assignedTo: { id: fixer.user.id } });
    const notes = await prisma.notification.findMany({ where: { type: "MAINTENANCE_ASSIGNED" } });
    expect(notes).toHaveLength(1);
    expect(notes[0]).toMatchObject({ userId: fixer.user.id, title: "Maintenance request assigned: AC leaking", link: `/maintenance/${req.id}` });
    // re-assigning to the same person does not notify again
    await assignRequest(f.admin, req.id, { assignedToUserId: fixer.user.id });
    expect(await prisma.notification.count({ where: { type: "MAINTENANCE_ASSIGNED" } })).toBe(1);

    // the assignee (STAFF) drives the request; an unrelated teacher cannot
    await expect(updateStatus(f.teacher2.auth, req.id, { status: "IN_PROGRESS" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    const inProgress = await api(statusRoute, { cookie: await signIn(fixer.user.email), params: { id: req.id }, body: { status: "IN_PROGRESS" } });
    expect(inProgress.status).toBe(200);
    expect(inProgress.data).toMatchObject({ status: "IN_PROGRESS", resolvedAt: null, closedAt: null });

    const invalid = await api(statusRoute, { cookie: await signIn(fixer.user.email), params: { id: req.id }, body: { status: "CLOSED" } });
    expect(invalid.status).toBe(422);
    expect(invalid.error?.message).toBe("Cannot change status from IN_PROGRESS to CLOSED");
    await expect(updateStatus(fixer.auth, req.id, { status: "OPEN" })).rejects.toMatchObject({ code: "VALIDATION_ERROR" });

    const resolved = await updateStatus(fixer.auth, req.id, { status: "RESOLVED", resolutionNote: "Replaced the hose" });
    expect(resolved.status).toBe("RESOLVED");
    expect(resolved.resolvedAt).toBeInstanceOf(Date);
    expect(resolved.closedAt).toBeNull();
    expect(resolved.resolutionNote).toBe("Replaced the hose");
    // the reporter cannot close it (not a manager, not the assignee)
    await expect(updateStatus(f.teacher.auth, req.id, { status: "CLOSED" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    const closed = await updateStatus(f.admin, req.id, { status: "CLOSED" });
    expect(closed.status).toBe("CLOSED");
    expect(closed.closedAt).toBeInstanceOf(Date);
    expect(closed.resolvedAt?.getTime()).toBe(resolved.resolvedAt!.getTime());
    await expect(updateStatus(f.admin, req.id, { status: "OPEN" })).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    await expect(assignRequest(f.admin, req.id, { assignedToUserId: fixer.user.id })).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    expect(await prisma.auditLog.count({ where: { action: "maintenance.status", entityId: req.id } })).toBe(3);

    // reopening from RESOLVED clears the timestamps
    const again = await createRequest(f.teacher.auth, { title: "Again", category: "OTHER", priority: "LOW" });
    await updateStatus(f.admin, again.id, { status: "IN_PROGRESS" });
    await updateStatus(f.admin, again.id, { status: "RESOLVED" });
    const reopened = await updateStatus(f.admin, again.id, { status: "IN_PROGRESS" });
    expect(reopened.resolvedAt).toBeNull();
  });

  it("reporters see only their own requests; managers and assignees see theirs", async () => {
    const f = await createSchoolFixture();
    const fixer = await createMaintenanceStaff(f.school.id);
    const mine = await createRequest(f.teacher.auth, { title: "Mine", category: "FURNITURE", priority: "NORMAL" });
    const theirs = await createRequest(f.teacher2.auth, { title: "Theirs", category: "CLEANING", priority: "NORMAL" });
    await assignRequest(f.admin, theirs.id, { assignedToUserId: fixer.user.id });

    expect((await listRequests(f.teacher.auth)).map((r) => r.id)).toEqual([mine.id]);
    expect((await listRequests(f.teacher2.auth)).map((r) => r.id)).toEqual([theirs.id]);
    expect((await listRequests(f.admin)).map((r) => r.id).sort()).toEqual([mine.id, theirs.id].sort());
    expect((await listRequests(f.admin, { mine: "true" })).length).toBe(0);
    expect((await listRequests(f.admin, { status: "ASSIGNED" })).map((r) => r.id)).toEqual([theirs.id]);
    // maintenance staff hold maintenance:manage → see everything
    expect((await listRequests(fixer.auth)).length).toBe(2);
    const viaRoute = await api(getMaintenance, { cookie: await signIn(f.teacher.user.email) });
    expect(viaRoute.status).toBe(200);
    expect((viaRoute.data as Array<{ id: string; overdue: boolean }>).map((r) => [r.id, r.overdue])).toEqual([[mine.id, false]]);

    await expect(getRequest(f.teacher2.auth, mine.id)).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect((await getRequest(f.teacher.auth, mine.id)).id).toBe(mine.id);
    expect((await getRequest(fixer.auth, mine.id)).id).toBe(mine.id);
    const other = await createOtherSchool();
    await expect(getRequest(other.admin, mine.id)).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(await listRequests(other.admin)).toEqual([]);

    // reporters may edit their own OPEN request only
    expect((await updateRequest(f.teacher.auth, mine.id, { title: "Mine (edited)" })).title).toBe("Mine (edited)");
    await expect(updateRequest(f.teacher.auth, theirs.id, { title: "x" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(updateRequest(f.teacher2.auth, theirs.id, { title: "x" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect((await updateRequest(f.admin, theirs.id, { priority: "HIGH" })).priority).toBe("HIGH");
  });

  it("maintenanceDashboard counts open/assigned/in-progress/high-priority/overdue and recently resolved", async () => {
    const f = await createSchoolFixture();
    const fixer = await createMaintenanceStaff(f.school.id);
    const now = new Date();
    const open = await createRequest(f.teacher.auth, { title: "Open", category: "OTHER", priority: "NORMAL" });
    const overdueHigh = await createRequest(f.teacher.auth, { title: "Overdue", category: "COMPUTER", priority: "HIGH", dueDate: new Date(now.getTime() - 2 * DAY) });
    const assigned = await createRequest(f.teacher.auth, { title: "Assigned", category: "ROOM", priority: "URGENT", dueDate: new Date(now.getTime() + 2 * DAY) });
    await assignRequest(f.admin, assigned.id, { assignedToUserId: fixer.user.id });
    const inProgress = await createRequest(f.teacher.auth, { title: "In progress", category: "OTHER", priority: "LOW", dueDate: new Date(now.getTime() - DAY) });
    await updateStatus(f.admin, inProgress.id, { status: "IN_PROGRESS" });
    const resolved = await createRequest(f.teacher.auth, { title: "Resolved", category: "OTHER", priority: "HIGH", dueDate: new Date(now.getTime() - DAY) });
    await updateStatus(f.admin, resolved.id, { status: "IN_PROGRESS" });
    await updateStatus(f.admin, resolved.id, { status: "RESOLVED" });
    const closed = await createRequest(f.teacher.auth, { title: "Closed", category: "OTHER", priority: "NORMAL" });
    await updateStatus(f.admin, closed.id, { status: "CLOSED" });
    // another school's requests never leak in
    const other = await createOtherSchool();
    await createRequest(other.teacher.auth, { title: "Elsewhere", category: "OTHER", priority: "URGENT" });

    const dash = await maintenanceDashboard(f.school.id, now);
    expect(dash).toMatchObject({ open: 2, highPriority: 2, assigned: 1, inProgress: 1, overdueCount: 2 });
    expect(dash.overdue.map((r) => r.id)).toEqual([overdueHigh.id, inProgress.id]);
    expect(dash.recentlyResolved.map((r) => r.id).sort()).toEqual([resolved.id, closed.id].sort());
    expect(dash.overdue.map((r) => r.id)).not.toContain(open.id);

    const viaRoute = await api(maintenanceDashboardRoute, { cookie: await signIn(f.adminUser.email) });
    expect(viaRoute.status).toBe(200);
    expect(viaRoute.data).toMatchObject({ open: 2, assigned: 1, inProgress: 1, overdueCount: 2 });
    expect((await api(maintenanceDashboardRoute, { cookie: await signIn(f.teacher.user.email) })).status).toBe(403);
    await expect(getMaintenanceDashboard(f.teacher.auth)).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect((await getMaintenanceDashboard(fixer.auth)).open).toBe(2);
    // overdue flag in lists
    const listed = await listRequests(f.admin);
    expect(listed.find((r) => r.id === overdueHigh.id)?.overdue).toBe(true);
    expect(listed.find((r) => r.id === resolved.id)?.overdue).toBe(false);
  });
});
