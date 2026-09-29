import { describe, expect, it } from "vitest";
import { emailOutbox } from "../../setup/integration";
import { createOtherSchool, createSchoolFixture, createStudent, createTeacher, prisma } from "../helpers";
import { createLeaveRequest, createLeaveRequestSchema, reviewLeaveRequest } from "@/modules/leave";
import { assignSubstitute, suggestSubstitutes, substitutionsNeeded, updateSubstitutionStatus, listSubstitutions, getSubstitution } from "@/modules/substitution";
import { decideApproval } from "@/modules/approvals";
import { teacherDaySchedule } from "@/modules/timetable/service";
import { pendingAttendanceForTeacher } from "@/modules/attendance/service";
import { dayOfWeek, toDateOnly } from "@/lib/utils/dates";

const DAY = 86_400_000;
const ymd = (d: Date) => d.toISOString().slice(0, 10);
const plus = (d: Date, n: number) => new Date(d.getTime() + n * DAY);
function nextMonday() {
  let t = toDateOnly(new Date()).getTime() + 7 * DAY;
  while (dayOfWeek(new Date(t)) !== 1) t += DAY;
  return new Date(t);
}

/** Teacher on approved leave next Monday → one PENDING substitution need for the Monday period-1 slot. */
async function seed() {
  const f = await createSchoolFixture();
  const monday = nextMonday();
  const leave = await createLeaveRequest(f.teacher.auth, createLeaveRequestSchema.parse({ type: "SICK", startDate: ymd(monday), endDate: ymd(monday) }));
  await reviewLeaveRequest(f.admin, leave.id, "APPROVE");
  const sub = await prisma.substitution.findFirstOrThrow({ where: { leaveRequestId: leave.id } });
  expect(sub).toMatchObject({ status: "PENDING", timetableSlotId: f.slots[0].id, absentTeacherId: f.teacher.teacher.id });
  emailOutbox.sent.length = 0;
  return { f, monday, leave, sub };
}

describe("substitution", () => {
  it("suggests ranked candidates with transparent reasons and conflicts", async () => {
    const { f, monday, sub } = await seed();
    // teacher3 teaches another class at the same day/period
    const cls2 = await prisma.schoolClass.create({ data: { schoolId: f.school.id, academicYearId: f.year.id, name: "10B" } });
    const teacher3 = await createTeacher(f.school.id, { departmentId: f.department.id, subjectIds: [f.subject.id], name: "Busy Three" });
    const course3 = await prisma.course.create({ data: { schoolId: f.school.id, academicYearId: f.year.id, classId: cls2.id, subjectId: f.subject.id, teacherId: teacher3.teacher.id } });
    await prisma.timetableSlot.create({ data: { schoolId: f.school.id, courseId: course3.id, teacherId: teacher3.teacher.id, classId: cls2.id, periodId: f.periods[0].id, dayOfWeek: 1 } });
    // teacher4 is on approved leave that day
    const teacher4 = await createTeacher(f.school.id, { departmentId: f.department.id, subjectIds: [f.subject.id], name: "Away Four" });
    await prisma.leaveRequest.create({ data: { schoolId: f.school.id, requesterUserId: teacher4.user.id, teacherId: teacher4.teacher.id, status: "APPROVED", startDate: monday, endDate: plus(monday, 1) } });
    // teacher5 marked UNAVAILABLE for Monday period 1
    const teacher5 = await createTeacher(f.school.id, { departmentId: f.department.id, subjectIds: [f.subject.id], name: "Unavailable Five" });
    await prisma.teacherAvailability.create({ data: { teacherId: teacher5.teacher.id, dayOfWeek: 1, periodId: f.periods[0].id, type: "UNAVAILABLE" } });
    // teacher6: different subject/department but prefers substitution then
    const teacher6 = await createTeacher(f.school.id, { departmentId: null, subjectIds: [f.otherSubject.id], name: "Other Six" });
    await prisma.teacherAvailability.create({ data: { teacherId: teacher6.teacher.id, dayOfWeek: 1, periodId: null, type: "PREFERRED_SUBSTITUTION" } });

    const { candidates, need } = await suggestSubstitutes(f.admin, sub.id);
    expect(need).toMatchObject({ dayOfWeek: 1, periodId: f.periods[0].id, subjectId: f.subject.id, departmentId: f.department.id, absentTeacherId: f.teacher.teacher.id });
    const by = (id: string) => candidates.find((c) => c.teacherId === id)!;
    expect(by(f.teacher2.teacher.id)).toMatchObject({ eligible: true, subjectMatch: true, departmentMatch: true, conflicts: [] });
    expect(by(f.teacher2.teacher.id).reasons).toEqual(expect.arrayContaining(["Teaches this subject", "Same department", "Light workload"]));
    expect(by(teacher6.teacher.id)).toMatchObject({ eligible: true, subjectMatch: false, departmentMatch: false });
    expect(by(teacher6.teacher.id).reasons).toContain("Prefers substitution at this time");
    expect(by(f.teacher.teacher.id).conflicts).toContain("Is the absent teacher");
    expect(by(teacher3.teacher.id)).toMatchObject({ eligible: false, conflicts: ["Already teaching at this time"] });
    expect(by(teacher4.teacher.id)).toMatchObject({ eligible: false, conflicts: ["On approved leave that day"] });
    expect(by(teacher5.teacher.id)).toMatchObject({ eligible: false, conflicts: ["Marked unavailable at this time"] });
    // ranking: eligible first, best score first
    expect(candidates[0].teacherId).toBe(f.teacher2.teacher.id);
    expect(candidates[1].teacherId).toBe(teacher6.teacher.id);
    expect(candidates.slice(2).every((c) => !c.eligible)).toBe(true);
    expect(candidates.every((c) => c.eligible || c.score === Number.NEGATIVE_INFINITY)).toBe(true);
    // teachers cannot ask for suggestions
    await expect(suggestSubstitutes(f.teacher2.auth, sub.id)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("assigns an eligible substitute and notifies the substitute (email), the absent teacher and the students", async () => {
    const { f, monday, sub } = await seed();
    const assigned = await assignSubstitute(f.admin, sub.id, f.teacher2.teacher.id, "Please use the worksheet");
    expect(assigned).toMatchObject({ status: "ASSIGNED", substituteTeacherId: f.teacher2.teacher.id, note: "Please use the worksheet" });

    const subNote = await prisma.notification.findFirstOrThrow({ where: { userId: f.teacher2.user.id, type: "SUBSTITUTE_ASSIGNED" } });
    expect(subNote.title).toBe("Substitution assigned: Mathematics – 10A, Period 1");
    expect(subNote.body).toBe(`You are covering ${f.teacher.user.name} on ${ymd(monday)}.`);
    expect(subNote.link).toBe(`/substitutions/${sub.id}`);
    expect(subNote.emailSentAt).not.toBeNull();
    expect(emailOutbox.sent.filter((m) => m.to === f.teacher2.user.email).map((m) => m.subject)).toEqual(["[Edura] Substitution assigned: Mathematics – 10A, Period 1"]);

    const covered = await prisma.notification.findFirstOrThrow({ where: { userId: f.teacher.user.id, type: "CLASS_COVERED" } });
    expect(covered.body).toBe(`${f.teacher2.user.name} will cover your lesson on ${ymd(monday)}.`);
    expect(covered.emailSentAt).toBeNull();

    const studentNotes = await prisma.notification.findMany({ where: { title: `Substitute teacher on ${ymd(monday)}` } });
    expect(new Set(studentNotes.map((n) => n.userId))).toEqual(new Set(f.students.map((s) => s.user!.id)));
    expect(studentNotes[0].body).toBe(`${f.teacher2.user.name} will teach Mathematics (Period 1).`);

    // both teachers can read it; a third teacher cannot
    expect((await getSubstitution(f.teacher2.auth, sub.id)).id).toBe(sub.id);
    expect((await getSubstitution(f.teacher.auth, sub.id)).id).toBe(sub.id);
    const stranger = await createTeacher(f.school.id);
    await expect(getSubstitution(stranger.auth, sub.id)).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect((await listSubstitutions(f.teacher2.auth)).map((s) => s.id)).toEqual([sub.id]);
    expect(await listSubstitutions(stranger.auth)).toEqual([]);
  });

  it("refuses ineligible substitutes (CONFLICT) and teachers from other schools (VALIDATION)", async () => {
    const { f, sub } = await seed();
    const cls2 = await prisma.schoolClass.create({ data: { schoolId: f.school.id, academicYearId: f.year.id, name: "10B" } });
    const busy = await createTeacher(f.school.id, { departmentId: f.department.id, subjectIds: [f.subject.id] });
    const course = await prisma.course.create({ data: { schoolId: f.school.id, academicYearId: f.year.id, classId: cls2.id, subjectId: f.subject.id, teacherId: busy.teacher.id } });
    await prisma.timetableSlot.create({ data: { schoolId: f.school.id, courseId: course.id, teacherId: busy.teacher.id, classId: cls2.id, periodId: f.periods[0].id, dayOfWeek: 1 } });
    const err = await assignSubstitute(f.admin, sub.id, busy.teacher.id).catch((e) => e);
    expect(err).toMatchObject({ code: "CONFLICT", details: ["Already teaching at this time"] });
    await expect(assignSubstitute(f.admin, sub.id, f.teacher.teacher.id)).rejects.toMatchObject({ code: "CONFLICT" });

    const other = await createOtherSchool();
    await expect(assignSubstitute(f.admin, sub.id, other.teacher.teacher.id)).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    await expect(assignSubstitute(other.admin, sub.id, other.teacher.teacher.id)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(assignSubstitute(f.teacher.auth, sub.id, f.teacher2.teacher.id)).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect((await prisma.substitution.findUniqueOrThrow({ where: { id: sub.id } })).status).toBe("PENDING");
    expect(await prisma.notification.count({ where: { type: "SUBSTITUTE_ASSIGNED" } })).toBe(0);
  });

  it("a declined substitution returns to PENDING without a substitute and alerts administrators", async () => {
    const { f, monday, sub } = await seed();
    await assignSubstitute(f.admin, sub.id, f.teacher2.teacher.id);
    // only the assigned substitute (or an admin) may decline
    const stranger = await createTeacher(f.school.id);
    await expect(updateSubstitutionStatus(stranger.auth, sub.id, "DECLINED")).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(updateSubstitutionStatus(f.teacher2.auth, sub.id, "COMPLETED")).rejects.toMatchObject({ code: "FORBIDDEN" });

    const declined = await updateSubstitutionStatus(f.teacher2.auth, sub.id, "DECLINED", "Doctor appointment");
    expect(declined).toMatchObject({ status: "PENDING", substituteTeacherId: null, note: "Doctor appointment" });
    const alerts = await prisma.notification.findMany({ where: { type: "ALERT", title: "Substitution declined" } });
    expect(new Set(alerts.map((a) => a.userId))).toEqual(new Set([f.adminUser.id, f.principal.id]));
    expect(alerts[0].body).toBe(`${f.teacher2.user.name} declined to cover Mathematics on ${ymd(monday)}.`);
    // it shows up again as a need
    expect((await substitutionsNeeded(f.school.id, monday)).map((s) => s.id)).toEqual([sub.id]);
  });

  it("substitutionsNeeded lists PENDING needs within the window", async () => {
    const { f, monday, sub } = await seed();
    expect((await substitutionsNeeded(f.school.id, monday)).map((s) => s.id)).toEqual([sub.id]);
    expect((await substitutionsNeeded(f.school.id, plus(monday, -7))).map((s) => s.id)).toEqual([sub.id]);
    expect(await substitutionsNeeded(f.school.id, plus(monday, -8))).toEqual([]); // 8 days ahead
    expect(await substitutionsNeeded(f.school.id, plus(monday, 1))).toEqual([]); // already past
    await assignSubstitute(f.admin, sub.id, f.teacher2.teacher.id);
    expect(await substitutionsNeeded(f.school.id, monday)).toEqual([]);
  });

  it("the covered lesson moves to the substitute's day schedule and pending attendance", async () => {
    const { f, monday, sub } = await seed();
    await assignSubstitute(f.admin, sub.id, f.teacher2.teacher.id);

    const subSchedule = await teacherDaySchedule(f.teacher2.auth, f.teacher2.teacher.id, monday);
    expect(subSchedule.dayOfWeek).toBe(1);
    expect(subSchedule.lessons).toHaveLength(1);
    expect(subSchedule.lessons[0]).toMatchObject({ kind: "SUBSTITUTION", substitutionStatus: "ASSIGNED", slot: { id: f.slots[0].id } });
    expect((subSchedule.lessons[0] as { coveringFor: { user: { id: string } } }).coveringFor.user.id).toBe(f.teacher.user.id);

    const absentSchedule = await teacherDaySchedule(f.teacher.auth, f.teacher.teacher.id, monday);
    expect(absentSchedule.lessons).toHaveLength(1);
    expect(absentSchedule.lessons[0]).toMatchObject({ kind: "OWN", substitutionStatus: "ASSIGNED", slot: { id: f.slots[0].id } });
    expect((absentSchedule.lessons[0] as { coveredBy: { user: { id: string } } }).coveredBy.user.id).toBe(f.teacher2.user.id);

    expect((await pendingAttendanceForTeacher(f.teacher2.teacher.id, monday)).map((s) => s.id)).toEqual([f.slots[0].id]);
    expect(await pendingAttendanceForTeacher(f.teacher.teacher.id, monday)).toEqual([]);
    // on a normal day the absent teacher still owns the lesson
    expect((await pendingAttendanceForTeacher(f.teacher.teacher.id, plus(monday, 7))).map((s) => s.id)).toEqual([f.slots[0].id]);
    // a substitute may also record attendance for students of that class (course access through the substitution)
    const student = await createStudent(f.school.id, f.cls.id, { withLogin: false });
    expect(student.student.classId).toBe(f.cls.id);
  });

  it("approvals: deciding the LeaveRequest approval delegates to the leave module and refuses self-approval", async () => {
    const f = await createSchoolFixture();
    const monday = nextMonday();
    const leave = await createLeaveRequest(f.teacher.auth, createLeaveRequestSchema.parse({ type: "PERSONAL", startDate: ymd(monday), endDate: ymd(plus(monday, 1)) }));
    const approval = await prisma.approval.findFirstOrThrow({ where: { entityType: "LeaveRequest", entityId: leave.id } });
    await expect(decideApproval(f.teacher.auth, approval.id, { action: "APPROVE" })).rejects.toMatchObject({ code: "FORBIDDEN" });

    const decided = await decideApproval(f.admin, approval.id, { action: "APPROVE", comment: "ok" });
    expect(decided).toMatchObject({ id: approval.id, status: "APPROVED", approverUserId: f.adminUser.id, comment: "ok" });
    const updatedLeave = await prisma.leaveRequest.findUniqueOrThrow({ where: { id: leave.id } });
    expect(updatedLeave).toMatchObject({ status: "APPROVED", reviewedById: f.adminUser.id, reviewComment: "ok" });
    expect(await prisma.substitution.count({ where: { leaveRequestId: leave.id, status: "PENDING" } })).toBe(2);
    expect(await prisma.notification.count({ where: { userId: f.teacher.user.id, type: "LEAVE_APPROVED" } })).toBe(1);
    await expect(decideApproval(f.admin, approval.id, { action: "REJECT" })).rejects.toMatchObject({ code: "CONFLICT" });

    // the principal's own request cannot be decided by the principal
    const own = await createLeaveRequest(f.principal, createLeaveRequestSchema.parse({ type: "ANNUAL", startDate: ymd(monday), endDate: ymd(monday) }));
    const ownApproval = await prisma.approval.findFirstOrThrow({ where: { entityId: own.id } });
    await expect(decideApproval(f.principal, ownApproval.id, { action: "APPROVE" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect((await prisma.leaveRequest.findUniqueOrThrow({ where: { id: own.id } })).status).toBe("PENDING");
    const rejected = await decideApproval(f.admin, ownApproval.id, { action: "REJECT", comment: "no" });
    expect(rejected.status).toBe("REJECTED");
    expect((await prisma.leaveRequest.findUniqueOrThrow({ where: { id: own.id } })).status).toBe("REJECTED");
  });
});
