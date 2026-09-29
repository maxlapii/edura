import { describe, expect, it } from "vitest";
import { createSchoolFixture, createUser, asUser, signIn, api, prisma } from "../helpers";
import { getCalendar } from "@/modules/calendar/service";
import { GET as calendarRoute } from "@/app/api/calendar/route";
import { toDateOnly } from "@/lib/utils/dates";

// Fixture week: Monday 2026-10-05 … Sunday 2026-10-11 (inside Term 1 of the fixture year).
const FROM = "2026-10-05";
const TO = "2026-10-11";
const WEEK_DATES = ["2026-10-05", "2026-10-06", "2026-10-07", "2026-10-08", "2026-10-09", "2026-10-10", "2026-10-11"];
const range = { from: toDateOnly(FROM), to: toDateOnly(TO) };

type Fixture = Awaited<ReturnType<typeof createSchoolFixture>>;

/** Meeting (teacher attends), leave for the teacher, a substitution for Wednesday, an assignment and a holiday. */
async function seedWeek(f: Fixture) {
  const meeting = await prisma.meeting.create({
    data: { schoolId: f.school.id, title: "Staff meeting", startsAt: new Date("2026-10-06T14:00:00Z"), endsAt: new Date("2026-10-06T15:00:00Z"), organizerUserId: f.adminUser.id, participants: { create: [{ userId: f.teacher.user.id }] } },
  });
  const leave = await prisma.leaveRequest.create({
    data: { schoolId: f.school.id, requesterUserId: f.teacher.user.id, teacherId: f.teacher.teacher.id, type: "SICK", startDate: toDateOnly("2026-10-07"), endDate: toDateOnly("2026-10-07"), status: "APPROVED" },
  });
  const wednesdaySlot = f.slots.find((s) => s.dayOfWeek === 3)!;
  const substitution = await prisma.substitution.create({
    data: { schoolId: f.school.id, leaveRequestId: leave.id, timetableSlotId: wednesdaySlot.id, date: toDateOnly("2026-10-07"), absentTeacherId: f.teacher.teacher.id, substituteTeacherId: f.teacher2.teacher.id, status: "ASSIGNED" },
  });
  const assignment = await prisma.assignment.create({ data: { schoolId: f.school.id, courseId: f.course.id, title: "Fractions homework", dueDate: new Date("2026-10-08T10:00:00Z"), status: "PUBLISHED" } });
  await prisma.assignment.create({ data: { schoolId: f.school.id, courseId: f.course.id, title: "Draft", dueDate: new Date("2026-10-09T10:00:00Z"), status: "DRAFT" } });
  const holiday = await prisma.event.create({ data: { schoolId: f.school.id, title: "Teachers' day", type: "HOLIDAY", startsAt: new Date("2026-10-09T00:00:00Z"), endsAt: new Date("2026-10-09T23:59:59Z"), status: "SCHEDULED", audience: "SCHOOL" } });
  const parentsEvent = await prisma.event.create({ data: { schoolId: f.school.id, title: "PTA evening", type: "PARENT_EVENT", startsAt: new Date("2026-10-08T18:00:00Z"), endsAt: new Date("2026-10-08T20:00:00Z"), status: "SCHEDULED", audience: "PARENTS", organizerUserId: f.adminUser.id } });
  return { meeting, leave, substitution, wednesdaySlot, assignment, holiday, parentsEvent };
}

const byKind = <T extends { kind: string }>(entries: T[], kind: string): T[] => entries.filter((e) => e.kind === kind);

describe("calendar", () => {
  it("teacher: lessons per slot date, meetings they attend, their leave, covered lessons and holidays", async () => {
    const f = await createSchoolFixture();
    const s = await seedWeek(f);
    const entries = await getCalendar(f.teacher.auth, range);

    const lessons = byKind(entries, "LESSON");
    expect(lessons).toHaveLength(7);
    const expectedIds = f.slots.map((slot) => `${slot.id}:${WEEK_DATES[slot.dayOfWeek - 1]}`).sort();
    expect(lessons.map((l) => l.id).sort()).toEqual(expectedIds);
    const monday = lessons.find((l) => l.meta.date === "2026-10-05")!;
    expect(monday.title).toBe("Mathematics · 10A");
    expect(monday.start.toISOString()).toBe("2026-10-05T08:00:00.000Z");
    expect(monday.end!.toISOString()).toBe("2026-10-05T08:45:00.000Z");
    expect(monday.link).toBe(`/classes/${f.cls.id}`);
    expect(monday.meta).toMatchObject({ classId: f.cls.id, courseId: f.course.id, teacherId: f.teacher.teacher.id, period: "Period 1", periodOrder: 1, room: "Room 1", subject: "Mathematics" });
    expect(monday.meta.covered).toBeUndefined();

    const wednesday = lessons.find((l) => l.id === `${s.wednesdaySlot.id}:2026-10-07`)!;
    expect(wednesday.meta).toMatchObject({ covered: true, substitutionId: s.substitution.id, substituteTeacherId: f.teacher2.teacher.id, substituteName: f.teacher2.user.name, substitutionStatus: "ASSIGNED" });

    const meetings = byKind(entries, "MEETING");
    expect(meetings).toHaveLength(1);
    expect(meetings[0]).toMatchObject({ id: s.meeting.id, title: "Staff meeting", link: `/meetings/${s.meeting.id}`, allDay: false });
    expect(meetings[0].meta).toMatchObject({ organizerUserId: f.adminUser.id, participants: 1 });

    const leave = byKind(entries, "LEAVE");
    expect(leave).toHaveLength(1);
    expect(leave[0]).toMatchObject({ id: s.leave.id, title: "Leave (sick)", allDay: true });
    expect(leave[0].meta).toMatchObject({ status: "APPROVED", teacherId: f.teacher.teacher.id, requesterUserId: f.teacher.user.id });

    const holidays = byKind(entries, "HOLIDAY");
    expect(holidays.map((h) => h.id)).toEqual([s.holiday.id]);
    expect(holidays[0].allDay).toBe(true);
    // teachers do not see parent-only events, substitutions (admin view) or terms
    expect(byKind(entries, "EVENT")).toEqual([]);
    expect(byKind(entries, "SUBSTITUTION")).toEqual([]);
    expect(byKind(entries, "TERM")).toEqual([]);
    expect(byKind(entries, "ASSIGNMENT")).toEqual([]);
    // sorted by start
    for (let i = 1; i < entries.length; i++) expect(entries[i].start.getTime()).toBeGreaterThanOrEqual(entries[i - 1].start.getTime());
  });

  it("substitute teacher sees the covered lesson as a 'Cover' entry, pending leave shows as pending", async () => {
    const f = await createSchoolFixture();
    const s = await seedWeek(f);
    await prisma.leaveRequest.create({ data: { schoolId: f.school.id, requesterUserId: f.teacher2.user.id, teacherId: f.teacher2.teacher.id, type: "PERSONAL", startDate: toDateOnly("2026-10-09"), endDate: toDateOnly("2026-10-10"), status: "PENDING" } });
    const entries = await getCalendar(f.teacher2.auth, range);
    const lessons = byKind(entries, "LESSON");
    expect(lessons).toHaveLength(1);
    expect(lessons[0]).toMatchObject({ id: `${s.wednesdaySlot.id}:2026-10-07`, title: "Cover: Mathematics · 10A", link: `/substitutions/${s.substitution.id}` });
    expect(lessons[0].meta).toMatchObject({ substitution: true, substitutionId: s.substitution.id, absentTeacherId: f.teacher.teacher.id });
    const leave = byKind(entries, "LEAVE");
    expect(leave).toHaveLength(1);
    expect(leave[0].title).toBe("Leave (personal) – pending");
    // the meeting is not theirs
    expect(byKind(entries, "MEETING")).toEqual([]);
    // kinds filter
    expect((await getCalendar(f.teacher2.auth, { ...range, kinds: ["LEAVE"] })).map((e) => e.kind)).toEqual(["LEAVE"]);
  });

  it("student: class lessons, published assignment due dates, student/school events and holidays", async () => {
    const f = await createSchoolFixture();
    const s = await seedWeek(f);
    const entries = await getCalendar(f.students[1].auth!, range);
    const lessons = byKind(entries, "LESSON");
    expect(lessons).toHaveLength(7);
    expect(lessons.map((l) => l.id).sort()).toEqual(f.slots.map((slot) => `${slot.id}:${WEEK_DATES[slot.dayOfWeek - 1]}`).sort());
    expect(lessons[0].meta.teacherName).toBe(f.teacher.user.name);
    expect(lessons[0].meta.covered).toBeUndefined();

    const assignments = byKind(entries, "ASSIGNMENT");
    expect(assignments).toHaveLength(1);
    expect(assignments[0]).toMatchObject({ id: s.assignment.id, title: "Due: Fractions homework", link: `/assignments/${s.assignment.id}`, end: null });
    expect(assignments[0].start.toISOString()).toBe("2026-10-08T10:00:00.000Z");
    expect(assignments[0].meta).toMatchObject({ courseId: f.course.id, classId: f.cls.id, className: "10A", status: "PUBLISHED" });

    expect(byKind(entries, "HOLIDAY").map((h) => h.id)).toEqual([s.holiday.id]);
    expect(byKind(entries, "EVENT")).toEqual([]); // PARENTS-only event hidden
    expect(byKind(entries, "LEAVE")).toEqual([]);
    expect(byKind(entries, "MEETING")).toEqual([]);

    // a student without a class only gets holidays/events
    const orphan = await prisma.student.create({ data: { schoolId: f.school.id, userId: (await createUser("STUDENT", f.school.id)).id, studentNumber: "S-orphan", firstName: "No", lastName: "Class" } });
    const orphanEntries = await getCalendar(await asUser(orphan.userId!), range);
    expect(orphanEntries.map((e) => e.kind)).toEqual(["HOLIDAY"]);
  });

  it("parent: children's lessons and assignments (tagged with the child), parent events and holidays", async () => {
    const f = await createSchoolFixture();
    const s = await seedWeek(f);
    const entries = await getCalendar(f.guardian.auth, range);
    const lessons = byKind(entries, "LESSON");
    expect(lessons).toHaveLength(7);
    expect(lessons.every((l) => JSON.stringify(l.meta.children) === JSON.stringify(["Kid1 Tester"]))).toBe(true);
    const assignments = byKind(entries, "ASSIGNMENT");
    expect(assignments.map((a) => a.id)).toEqual([s.assignment.id]);
    expect(assignments[0].meta.children).toEqual(["Kid1 Tester"]);
    expect(byKind(entries, "EVENT").map((e) => e.id)).toEqual([s.parentsEvent.id]);
    expect(byKind(entries, "HOLIDAY").map((e) => e.id)).toEqual([s.holiday.id]);
    expect(byKind(entries, "LEAVE")).toEqual([]);
    expect(byKind(entries, "SUBSTITUTION")).toEqual([]);

    // a guardian without children only sees holidays and parent events
    const childless = await prisma.guardian.create({ data: { schoolId: f.school.id, userId: (await createUser("PARENT", f.school.id)).id } });
    const kinds = (await getCalendar(await asUser(childless.userId), range)).map((e) => e.kind).sort();
    expect(kinds).toEqual(["EVENT", "HOLIDAY"]);
  });

  it("admin: approved leave, pending/assigned substitutions, terms, all events and own meetings – no lessons", async () => {
    const f = await createSchoolFixture();
    const s = await seedWeek(f);
    // pending leave must not show for admins; a pending substitution must
    await prisma.leaveRequest.create({ data: { schoolId: f.school.id, requesterUserId: f.teacher2.user.id, teacherId: f.teacher2.teacher.id, type: "PERSONAL", startDate: toDateOnly("2026-10-09"), endDate: toDateOnly("2026-10-09"), status: "PENDING" } });
    const thursdaySlot = f.slots.find((sl) => sl.dayOfWeek === 4)!;
    const pendingSub = await prisma.substitution.create({ data: { schoolId: f.school.id, timetableSlotId: thursdaySlot.id, date: toDateOnly("2026-10-08"), absentTeacherId: f.teacher.teacher.id, status: "PENDING" } });
    const entries = await getCalendar(f.admin, range);

    expect(byKind(entries, "LESSON")).toEqual([]);
    expect(byKind(entries, "ASSIGNMENT")).toEqual([]);
    const leave = byKind(entries, "LEAVE");
    expect(leave.map((l) => l.id)).toEqual([s.leave.id]);
    expect(leave[0].title).toBe(`${f.teacher.user.name} on leave`);

    const subs = byKind(entries, "SUBSTITUTION");
    expect(subs.map((x) => x.id).sort()).toEqual([s.substitution.id, pendingSub.id].sort());
    const pending = subs.find((x) => x.id === pendingSub.id)!;
    expect(pending.title).toBe("Substitute needed: Mathematics · 10A");
    expect(pending.start.toISOString()).toBe("2026-10-08T08:00:00.000Z");
    expect(pending.meta).toMatchObject({ status: "PENDING", slotId: thursdaySlot.id, absentTeacherName: f.teacher.user.name, substituteTeacherId: null });
    expect(subs.find((x) => x.id === s.substitution.id)!.title).toBe("Substitution: Mathematics · 10A");

    const terms = byKind(entries, "TERM");
    expect(terms).toHaveLength(1);
    expect(terms[0]).toMatchObject({ id: f.term.id, title: "Term 1 (2026/2027)", allDay: true, link: null });
    expect(terms[0].meta).toMatchObject({ academicYearId: f.year.id, isCurrent: true });

    expect(byKind(entries, "EVENT").map((e) => e.id)).toEqual([s.parentsEvent.id]);
    expect(byKind(entries, "HOLIDAY").map((e) => e.id)).toEqual([s.holiday.id]);
    // the admin organised the meeting
    expect(byKind(entries, "MEETING").map((e) => e.id)).toEqual([s.meeting.id]);
    // principal (admin-like) but not organizer/participant → no meeting
    expect(byKind(await getCalendar(f.principal, range), "MEETING")).toEqual([]);
  });

  it("rejects ranges longer than 62 days or inverted, and defaults to one week", async () => {
    const f = await createSchoolFixture();
    await expect(getCalendar(f.teacher.auth, { from: toDateOnly("2026-10-01"), to: toDateOnly("2026-12-02") })).rejects.toMatchObject({ code: "VALIDATION_ERROR", details: { days: 63, max: 62 } });
    await expect(getCalendar(f.teacher.auth, { from: toDateOnly("2026-10-10"), to: toDateOnly("2026-10-09") })).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    expect((await getCalendar(f.teacher.auth, { from: toDateOnly("2026-10-01"), to: toDateOnly("2026-12-01") })).filter((e) => e.kind === "LESSON")).toHaveLength(62);

    const cookie = await signIn(f.teacher.user.email);
    const tooLong = await api(calendarRoute, { cookie, query: { from: "2026-10-01", to: "2026-12-31" } });
    expect(tooLong.status).toBe(422);
    expect(tooLong.error?.code).toBe("VALIDATION_ERROR");
    const badFormat = await api(calendarRoute, { cookie, query: { from: "01/10/2026" } });
    expect(badFormat.status).toBe(422);

    const week = await api(calendarRoute, { cookie, query: { from: FROM, to: TO, kinds: "LESSON,MEETING" } });
    expect(week.status).toBe(200);
    expect((week.data as Array<{ kind: string }>).filter((e) => e.kind === "LESSON")).toHaveLength(7);
    // default range: from today, 7 days → 7 lessons for the fixture teacher
    const dflt = await api(calendarRoute, { cookie });
    expect(dflt.status).toBe(200);
    expect((dflt.data as Array<{ kind: string }>).filter((e) => e.kind === "LESSON")).toHaveLength(7);
  });

  it("holidays are visible to every role and events are isolated per school", async () => {
    const f = await createSchoolFixture();
    const s = await seedWeek(f);
    const staff = await asUser((await createUser("STAFF", f.school.id)).id);
    for (const viewer of [f.admin, f.principal, f.teacher.auth, f.teacher2.auth, f.students[0].auth!, f.guardian.auth, staff]) {
      expect(byKind(await getCalendar(viewer, range), "HOLIDAY").map((h) => h.id)).toEqual([s.holiday.id]);
    }
    // cancelled holidays disappear
    await prisma.event.update({ where: { id: s.holiday.id }, data: { status: "CANCELLED" } });
    expect(byKind(await getCalendar(f.teacher.auth, range), "HOLIDAY")).toEqual([]);
    // staff see meetings they attend and SCHOOL/STAFF events only
    await prisma.meetingParticipant.create({ data: { meetingId: s.meeting.id, userId: staff.id } });
    const staffEntries = await getCalendar(staff, range);
    expect(byKind(staffEntries, "MEETING").map((m) => m.id)).toEqual([s.meeting.id]);
    expect(byKind(staffEntries, "EVENT")).toEqual([]);
    expect(byKind(staffEntries, "LESSON")).toEqual([]);
  });
});
