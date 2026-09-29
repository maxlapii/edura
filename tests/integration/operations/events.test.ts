import { describe, expect, it } from "vitest";
import { createSchoolFixture, createOtherSchool, createStudent, signIn, api, prisma } from "../helpers";
import { addEventParticipants, cancelEvent, createEvent, getEvent, listEvents, updateEvent, upcomingEvents } from "@/modules/events/service";
import { createApproval, decideApproval, getApproval, listApprovals } from "@/modules/approvals/service";
import { POST as postEvent, GET as getEvents } from "@/app/api/events/route";
import { POST as addParticipantsRoute } from "@/app/api/events/[id]/participants/route";
import { DELETE as cancelEventRoute } from "@/app/api/events/[id]/route";
import { POST as decideRoute } from "@/app/api/approvals/[id]/decide/route";

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

function when(daysFromNow: number, hours = 2) {
  const startsAt = new Date(Date.now() + daysFromNow * DAY);
  return { startsAt, endsAt: new Date(startsAt.getTime() + hours * HOUR) };
}

const base = { type: "SCHOOL_EVENT" as const, audience: "SCHOOL" as const, requiresApproval: false, participantUserIds: [], participantStudentIds: [] };

describe("events", () => {
  it("admin creates a SCHEDULED event: EVENT_CREATED workflow run and admin notifications", async () => {
    const f = await createSchoolFixture();
    const res = await api(postEvent, {
      cookie: await signIn(f.adminUser.email),
      body: { title: "Science fair", type: "SCHOOL_EVENT", ...when(5), location: "Hall", audience: "SCHOOL", participantUserIds: [f.teacher.user.id], participantStudentIds: [f.students[0].student.id] },
    });
    expect(res.status).toBe(201);
    const event = res.data as { id: string; status: string; organizerUserId: string; participants: Array<{ userId: string | null; studentId: string | null }>; _count: { participants: number } };
    expect(event.status).toBe("SCHEDULED");
    expect(event.organizerUserId).toBe(f.adminUser.id);
    expect(event._count.participants).toBe(2);
    expect(event.participants.map((p) => p.userId ?? p.studentId).sort()).toEqual([f.teacher.user.id, f.students[0].student.id].sort());

    const runs = await prisma.workflowRun.findMany({ where: { schoolId: f.school.id, trigger: "EVENT_CREATED" } });
    expect(runs).toHaveLength(1);
    expect(runs[0].status).toBe("SUCCESS");
    expect(runs[0].payload).toMatchObject({ eventId: event.id, title: "Science fair", status: "SCHEDULED", organizerUserId: f.adminUser.id, requiresApproval: false });
    const notes = await prisma.notification.findMany({ where: { type: "EVENT_CREATED", title: "New event: Science fair" } });
    expect(notes.map((n) => n.userId).sort()).toEqual([f.adminUser.id, f.principal.id].sort());
    expect(notes[0].link).toBe(`/events/${event.id}`);
    expect(await prisma.approval.count()).toBe(0);
    expect(await prisma.auditLog.count({ where: { action: "event.create", entityId: event.id } })).toBe(1);
  });

  it("teachers (and other non-admin roles) cannot create events", async () => {
    const f = await createSchoolFixture();
    await expect(createEvent(f.teacher.auth, { title: "Nope", ...base, ...when(1) })).rejects.toMatchObject({ code: "FORBIDDEN" });
    const res = await api(postEvent, { cookie: await signIn(f.teacher.user.email), body: { title: "Nope", ...when(1) } });
    expect(res.status).toBe(403);
    expect(await prisma.event.count()).toBe(0);
    // participants must belong to the school
    const other = await createOtherSchool();
    await expect(createEvent(f.admin, { title: "Bad", ...base, ...when(1), participantUserIds: [other.teacher.user.id] })).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    await expect(createEvent(f.admin, { title: "Bad", ...base, ...when(1), participantStudentIds: [other.student.student.id] })).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    const bad = await api(postEvent, { cookie: await signIn(f.adminUser.email), body: { title: "Backwards", startsAt: when(1).endsAt, endsAt: when(1).startsAt } });
    expect(bad.status).toBe(422);
  });

  /**
   * Only SUPER_ADMIN / SCHOOL_ADMIN / PRINCIPAL hold `events:manage`, and all of them are admins,
   * so `createEvent` can never take the PENDING_APPROVAL branch (`requiresApproval && !isAdmin`).
   * An admin asking for approval still gets a SCHEDULED event without an Approval row.
   */
  it("requiresApproval by an admin is still SCHEDULED (no non-admin role can create events)", async () => {
    const f = await createSchoolFixture();
    const event = await createEvent(f.admin, { title: "Trip", ...base, type: "TRIP", requiresApproval: true, ...when(7) });
    expect(event.status).toBe("SCHEDULED");
    expect(event.requiresApproval).toBe(true);
    expect(await prisma.approval.count({ where: { entityType: "Event", entityId: event.id } })).toBe(0);
    expect(await prisma.notification.count({ where: { type: "APPROVAL_REQUESTED" } })).toBe(0);
  });

  it("decideApproval on an Event approval schedules/cancels the event and notifies the requester", async () => {
    const f = await createSchoolFixture();
    // The PENDING_APPROVAL state is not reachable through createEvent (see above); seed it directly.
    const makePending = async (title: string) => {
      const e = await prisma.event.create({ data: { schoolId: f.school.id, title, type: "TRIP", ...when(10), status: "PENDING_APPROVAL", requiresApproval: true, organizerUserId: f.teacher.user.id } });
      const a = await createApproval(f.school.id, { type: "TRIP", entityType: "Event", entityId: e.id, title: `Trip: ${title}`, requesterUserId: f.teacher.user.id });
      return { e, a };
    };
    const approve = await makePending("Museum");
    const reject = await makePending("Zoo");

    // requester sees only own approvals; admin sees the queue
    expect((await listApprovals(f.teacher.auth)).map((a) => a.id).sort()).toEqual([approve.a.id, reject.a.id].sort());
    await expect(listApprovals(f.teacher.auth, { scope: "all" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect((await listApprovals(f.admin, { status: "PENDING" })).length).toBe(2);
    await expect(getApproval(f.teacher2.auth, approve.a.id)).rejects.toMatchObject({ code: "FORBIDDEN" });
    // requester cannot decide their own request (even if they had the permission); teacher lacks approvals:decide
    await expect(decideApproval(f.teacher.auth, approve.a.id, { action: "APPROVE" })).rejects.toMatchObject({ code: "FORBIDDEN" });

    const res = await api(decideRoute, { cookie: await signIn(f.adminUser.email), params: { id: approve.a.id }, body: { action: "APPROVE", comment: "Have fun" } });
    expect(res.status).toBe(200);
    expect(res.data).toMatchObject({ status: "APPROVED", approverUserId: f.adminUser.id, comment: "Have fun" });
    expect((await prisma.event.findUniqueOrThrow({ where: { id: approve.e.id } })).status).toBe("SCHEDULED");

    const rejected = await decideApproval(f.principal, reject.a.id, { action: "REJECT", comment: "Too expensive" });
    expect(rejected.status).toBe("REJECTED");
    expect(rejected.decisionAt).toBeInstanceOf(Date);
    expect((await prisma.event.findUniqueOrThrow({ where: { id: reject.e.id } })).status).toBe("CANCELLED");

    const notes = await prisma.notification.findMany({ where: { type: "APPROVAL_DECIDED", userId: f.teacher.user.id }, orderBy: { createdAt: "asc" } });
    expect(notes.map((n) => n.title)).toEqual(["Approved: Trip: Museum", "Not approved: Trip: Zoo"]);
    expect(notes[0].body).toBe("Have fun");
    expect(notes[0].link).toBe(`/events/${approve.e.id}`);
    expect(notes[0].emailSentAt).toBeInstanceOf(Date);

    await expect(decideApproval(f.admin, approve.a.id, { action: "REJECT" })).rejects.toMatchObject({ code: "CONFLICT" });
    expect(await prisma.auditLog.count({ where: { action: { in: ["approval.approve", "approval.reject"] } } })).toBe(2);
  });

  it("students see SCHOOL/STUDENTS events (and ones they participate in) but not PARENTS-only or cancelled ones", async () => {
    const f = await createSchoolFixture();
    const forStudents = await createEvent(f.admin, { title: "Students", ...base, audience: "STUDENTS", ...when(1) });
    const forSchool = await createEvent(f.admin, { title: "School", ...base, audience: "SCHOOL", ...when(2) });
    await createEvent(f.admin, { title: "Parents", ...base, audience: "PARENTS", ...when(3) });
    await createEvent(f.admin, { title: "Teachers", ...base, audience: "TEACHERS", ...when(4) });
    const invited = await createEvent(f.admin, { title: "Invited", ...base, audience: "TEACHERS", ...when(5), participantStudentIds: [f.students[1].student.id] });
    const cancelled = await createEvent(f.admin, { title: "Cancelled", ...base, audience: "SCHOOL", ...when(6) });
    await cancelEvent(f.admin, cancelled.id);

    const student0 = f.students[0].auth!;
    expect((await listEvents(student0)).map((e) => e.title)).toEqual(["Students", "School"]);
    expect((await listEvents(f.students[1].auth!)).map((e) => e.title)).toEqual(["Students", "School", "Invited"]);
    await expect(getEvent(student0, invited.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(getEvent(student0, cancelled.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect((await getEvent(student0, forStudents.id)).id).toBe(forStudents.id);

    const res = await api(getEvents, { cookie: await signIn(f.students[0].user!.email) });
    expect(res.status).toBe(200);
    expect((res.data as Array<{ id: string }>).map((e) => e.id)).toEqual([forStudents.id, forSchool.id]);

    // admin sees everything, teachers see all non-draft events
    expect((await listEvents(f.admin)).length).toBe(6);
    expect((await listEvents(f.admin, { status: "CANCELLED" })).map((e) => e.id)).toEqual([cancelled.id]);
    expect((await listEvents(f.teacher.auth)).length).toBe(6);
  });

  it("parents see SCHOOL/PARENTS events and events their children take part in", async () => {
    const f = await createSchoolFixture();
    await createEvent(f.admin, { title: "Parents", ...base, audience: "PARENTS", ...when(1) });
    await createEvent(f.admin, { title: "School", ...base, audience: "SCHOOL", ...when(2) });
    await createEvent(f.admin, { title: "Students", ...base, audience: "STUDENTS", ...when(3) });
    await createEvent(f.admin, { title: "Child trip", ...base, type: "TRIP", audience: "STUDENTS", ...when(4), participantStudentIds: [f.students[0].student.id] });
    await createEvent(f.admin, { title: "Other child trip", ...base, type: "TRIP", audience: "STUDENTS", ...when(5), participantStudentIds: [f.students[1].student.id] });
    expect((await listEvents(f.guardian.auth)).map((e) => e.title)).toEqual(["Parents", "School", "Child trip"]);
    // other school sees nothing of it
    const other = await createOtherSchool();
    expect(await listEvents(other.admin)).toEqual([]);
  });

  it("addParticipants adds users and students once and notifies the new users", async () => {
    const f = await createSchoolFixture();
    const event = await createEvent(f.admin, { title: "Assembly", ...base, type: "ASSEMBLY", ...when(3), participantUserIds: [f.teacher.user.id] });
    await prisma.notification.deleteMany({});
    const res = await api(addParticipantsRoute, {
      cookie: await signIn(f.adminUser.email),
      params: { id: event.id },
      body: { userIds: [f.teacher.user.id, f.teacher2.user.id, f.adminUser.id], studentIds: [f.students[0].student.id, f.students[0].student.id], role: "HELPER" },
    });
    expect(res.status).toBe(201);
    const updated = res.data as { participants: Array<{ userId: string | null; studentId: string | null; role: string }> };
    expect(updated.participants).toHaveLength(4);
    expect(updated.participants.find((p) => p.userId === f.teacher2.user.id)?.role).toBe("HELPER");
    expect(updated.participants.find((p) => p.userId === f.teacher.user.id)?.role).toBe("PARTICIPANT");
    const notes = await prisma.notification.findMany({ where: { title: "You were added to: Assembly" } });
    expect(notes.map((n) => n.userId)).toEqual([f.teacher2.user.id]);

    await expect(addEventParticipants(f.teacher.auth, event.id, { userIds: [f.teacher2.user.id], studentIds: [], role: "PARTICIPANT" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    const empty = await api(addParticipantsRoute, { cookie: await signIn(f.adminUser.email), params: { id: event.id }, body: { userIds: [], studentIds: [] } });
    expect(empty.status).toBe(422);
  });

  it("cancel marks the event CANCELLED, closes pending approvals and notifies user participants", async () => {
    const f = await createSchoolFixture();
    const event = await createEvent(f.admin, { title: "Picnic", ...base, ...when(3), participantUserIds: [f.teacher.user.id, f.teacher2.user.id], participantStudentIds: [f.students[0].student.id] });
    await createApproval(f.school.id, { type: "EVENT", entityType: "Event", entityId: event.id, title: "Picnic", requesterUserId: f.teacher.user.id });
    await prisma.notification.deleteMany({});

    await expect(cancelEvent(f.teacher.auth, event.id)).rejects.toMatchObject({ code: "FORBIDDEN" });
    const res = await api(cancelEventRoute, { cookie: await signIn(f.adminUser.email), method: "DELETE", params: { id: event.id } });
    expect(res.status).toBe(200);
    expect(res.data).toMatchObject({ id: event.id, status: "CANCELLED" });
    expect((await prisma.approval.findFirstOrThrow({ where: { entityId: event.id } })).status).toBe("CANCELLED");
    const notes = await prisma.notification.findMany({ where: { title: "Event cancelled: Picnic" } });
    expect(notes.map((n) => n.userId).sort()).toEqual([f.teacher.user.id, f.teacher2.user.id].sort());

    await expect(cancelEvent(f.admin, event.id)).rejects.toMatchObject({ code: "CONFLICT" });
    await expect(updateEvent(f.admin, event.id, { title: "Revived" })).rejects.toMatchObject({ code: "CONFLICT" });
    await expect(addEventParticipants(f.admin, event.id, { userIds: [f.teacher.user.id], studentIds: [], role: "PARTICIPANT" })).rejects.toMatchObject({ code: "CONFLICT" });
    // cancelled events do not count as upcoming
    expect(await upcomingEvents(f.school.id, 14)).toEqual([]);
  });

  it("updates events and reports upcoming ones", async () => {
    const f = await createSchoolFixture();
    const event = await createEvent(f.admin, { title: "Old", ...base, ...when(3) });
    const updated = await updateEvent(f.admin, event.id, { title: "New", location: "Gym", status: "COMPLETED" });
    expect(updated).toMatchObject({ title: "New", location: "Gym", status: "COMPLETED" });
    await expect(updateEvent(f.admin, event.id, { endsAt: new Date(event.startsAt.getTime() - HOUR) })).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    const other = await createOtherSchool();
    await expect(updateEvent(other.admin, event.id, { title: "Hijack" })).rejects.toMatchObject({ code: "FORBIDDEN" });

    const soon = await createEvent(f.admin, { title: "Soon", ...base, ...when(2) });
    await createEvent(f.admin, { title: "Far", ...base, ...when(30) });
    expect((await upcomingEvents(f.school.id, 14)).map((e) => e.id)).toEqual([soon.id]);
    // a student in another class still only sees student/school events
    const extra = await createStudent(f.school.id, null);
    expect((await listEvents(extra.auth!)).map((e) => e.title)).toEqual(["Soon", "Far"]);
  });
});
