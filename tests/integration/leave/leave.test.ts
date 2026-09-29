import { describe, expect, it } from "vitest";
import { emailOutbox } from "../../setup/integration";
import { createSchoolFixture, prisma } from "../helpers";
import { absentTeachers, cancelLeaveRequest, createLeaveRequest, createLeaveRequestSchema, getLeaveRequest, listLeaveRequests, reviewLeaveRequest, syncTeacherLeaveStatus } from "@/modules/leave";
import { dayOfWeek, toDateOnly } from "@/lib/utils/dates";

const DAY = 86_400_000;
const ymd = (d: Date) => d.toISOString().slice(0, 10);
const plus = (d: Date, n: number) => new Date(d.getTime() + n * DAY);
/** First Monday at least a week from today (keeps "covers today" side effects out of the impact tests). */
function nextMonday() {
  let t = toDateOnly(new Date()).getTime() + 7 * DAY;
  while (dayOfWeek(new Date(t)) !== 1) t += DAY;
  return new Date(t);
}
const leaveInput = (start: Date, end: Date, o: Record<string, unknown> = {}) => createLeaveRequestSchema.parse({ type: "SICK", startDate: ymd(start), endDate: ymd(end), ...o });

describe("leave requests", () => {
  it("creating a request opens a PENDING approval, records a LEAVE_REQUESTED run and notifies administrators", async () => {
    const f = await createSchoolFixture();
    const mon = nextMonday();
    const leave = await createLeaveRequest(f.teacher.auth, leaveInput(mon, plus(mon, 2), { reason: "Flu" }));
    expect(leave).toMatchObject({ status: "PENDING", teacherId: f.teacher.teacher.id, requesterUserId: f.teacher.user.id, type: "SICK", reason: "Flu" });
    expect(ymd(leave.startDate)).toBe(ymd(mon));

    const approval = await prisma.approval.findFirstOrThrow({ where: { entityType: "LeaveRequest", entityId: leave.id } });
    expect(approval).toMatchObject({ status: "PENDING", type: "LEAVE", requesterUserId: f.teacher.user.id, schoolId: f.school.id });
    const run = await prisma.workflowRun.findFirstOrThrow({ where: { trigger: "LEAVE_REQUESTED" } });
    expect(run.status).toBe("SUCCESS");
    expect(run.payload).toMatchObject({ leaveRequestId: leave.id, requesterName: f.teacher.user.name, leaveType: "SICK", days: 3 });
    const notes = await prisma.notification.findMany({ where: { type: "LEAVE_REQUESTED" } });
    expect(new Set(notes.map((n) => n.userId))).toEqual(new Set([f.adminUser.id, f.principal.id]));
    expect(notes[0].title).toBe(`Leave request from ${f.teacher.user.name}`);
    expect(notes[0].link).toBe(`/admin/leave/${leave.id}`);
  });

  it("rejects overlapping pending/approved requests", async () => {
    const f = await createSchoolFixture();
    const mon = nextMonday();
    await createLeaveRequest(f.teacher.auth, leaveInput(mon, plus(mon, 2)));
    await expect(createLeaveRequest(f.teacher.auth, leaveInput(plus(mon, 2), plus(mon, 4)))).rejects.toMatchObject({ code: "CONFLICT" });
    // adjacent (non-overlapping) is fine, and another teacher may overlap
    await createLeaveRequest(f.teacher.auth, leaveInput(plus(mon, 3), plus(mon, 3)));
    await createLeaveRequest(f.teacher2.auth, leaveInput(mon, mon));
    expect(await prisma.leaveRequest.count()).toBe(3);
    // schema refuses inverted ranges
    expect(() => leaveInput(plus(mon, 1), mon)).toThrow();
  });

  it("impact analysis lists affected lessons, students and (for reviewers) eligible substitutes", async () => {
    const f = await createSchoolFixture();
    const mon = nextMonday();
    const leave = await createLeaveRequest(f.teacher.auth, leaveInput(mon, plus(mon, 2)));
    const own = await getLeaveRequest(f.teacher.auth, leave.id);
    expect(own.impact).toMatchObject({ lessons: 3, days: 3, workingDays: 3, studentsAffected: 3, classesAffected: 1 });
    expect(own.impact.affected.map((a) => ymd(a.date))).toEqual([ymd(mon), ymd(plus(mon, 1)), ymd(plus(mon, 2))]);
    expect(own.impact.affected.map((a) => a.slot.id)).toEqual([f.slots[0].id, f.slots[1].id, f.slots[2].id]);
    expect(own.impact.affected[0].slot.course.class.name).toBe("10A");
    expect(own.impact.affected[0].substitution).toBeNull();
    // the requester is not a reviewer → no suggestions
    expect(own.impact.affected.every((a) => a.suggestions.length === 0)).toBe(true);

    const adminView = await getLeaveRequest(f.admin, leave.id);
    for (const a of adminView.impact.affected) {
      const t2 = a.suggestions.find((c) => c.teacherId === f.teacher2.teacher.id);
      expect(t2).toBeDefined();
      expect(t2).toMatchObject({ eligible: true, subjectMatch: true, departmentMatch: true, conflicts: [] });
      expect(t2!.reasons).toEqual(expect.arrayContaining(["Teaches this subject", "Same department"]));
      expect(a.suggestions.some((c) => c.teacherId === f.teacher.teacher.id)).toBe(false);
      expect(a.suggestions.every((c) => c.eligible)).toBe(true);
    }
  });

  it("teachers cannot see other teachers' requests; admins and listing scopes work", async () => {
    const f = await createSchoolFixture();
    const mon = nextMonday();
    const leave = await createLeaveRequest(f.teacher.auth, leaveInput(mon, mon));
    await expect(getLeaveRequest(f.teacher2.auth, leave.id)).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect((await getLeaveRequest(f.admin, leave.id)).id).toBe(leave.id);
    expect((await getLeaveRequest(f.principal, leave.id)).id).toBe(leave.id);
    expect((await listLeaveRequests(f.teacher2.auth)).map((l) => l.id)).toEqual([]);
    expect((await listLeaveRequests(f.teacher2.auth, { scope: "all" })).map((l) => l.id)).toEqual([]); // no leave:read_all
    expect((await listLeaveRequests(f.teacher.auth)).map((l) => l.id)).toEqual([leave.id]);
    expect((await listLeaveRequests(f.admin, { scope: "all" })).map((l) => l.id)).toEqual([leave.id]);
    expect((await listLeaveRequests(f.admin, { scope: "all", status: "APPROVED" })).map((l) => l.id)).toEqual([]);
  });

  it("approval creates one PENDING substitution per affected lesson and notifies the requester (with email)", async () => {
    const f = await createSchoolFixture();
    const mon = nextMonday();
    const leave = await createLeaveRequest(f.teacher.auth, leaveInput(mon, plus(mon, 2)));
    emailOutbox.sent.length = 0;
    const reviewed = await reviewLeaveRequest(f.admin, leave.id, "APPROVE", "Get well");
    expect(reviewed).toMatchObject({ status: "APPROVED", reviewedById: f.adminUser.id, reviewComment: "Get well" });
    expect(reviewed.reviewedAt).toBeInstanceOf(Date);
    expect(reviewed.impact.lessons).toBe(3);

    const approval = await prisma.approval.findFirstOrThrow({ where: { entityType: "LeaveRequest", entityId: leave.id } });
    expect(approval).toMatchObject({ status: "APPROVED", approverUserId: f.adminUser.id, comment: "Get well" });
    expect(approval.decisionAt).not.toBeNull();

    const subs = await prisma.substitution.findMany({ where: { leaveRequestId: leave.id }, orderBy: { date: "asc" } });
    expect(subs).toHaveLength(3);
    expect(subs.every((s) => s.status === "PENDING" && s.absentTeacherId === f.teacher.teacher.id && s.substituteTeacherId === null)).toBe(true);
    expect(subs.map((s) => s.timetableSlotId)).toEqual([f.slots[0].id, f.slots[1].id, f.slots[2].id]);
    expect(subs.map((s) => ymd(s.date))).toEqual([ymd(mon), ymd(plus(mon, 1)), ymd(plus(mon, 2))]);
    expect(reviewed.impact.affected.every((a) => a.substitution?.status === "PENDING")).toBe(true);

    const run = await prisma.workflowRun.findFirstOrThrow({ where: { trigger: "LEAVE_APPROVED" } });
    expect(run.status).toBe("SUCCESS");
    expect(run.payload).toMatchObject({ leaveRequestId: leave.id, affectedLessons: 3, reviewerName: f.admin.name });
    const note = await prisma.notification.findFirstOrThrow({ where: { userId: f.teacher.user.id, type: "LEAVE_APPROVED" } });
    expect(note.title).toBe("Your leave request was approved");
    expect(note.body).toContain("3 lesson(s) need cover");
    expect(note.emailSentAt).not.toBeNull();
    const mail = emailOutbox.sent.find((m) => m.to === f.teacher.user.email);
    expect(mail?.subject).toBe("[Edura] Your leave request was approved");
    expect(mail?.text).toContain(`/leave/${leave.id}`);
    // the leave is not covering today, so the teacher stays ACTIVE
    expect((await prisma.teacher.findUniqueOrThrow({ where: { id: f.teacher.teacher.id } })).status).toBe("ACTIVE");
    // cannot review twice
    await expect(reviewLeaveRequest(f.admin, leave.id, "REJECT")).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("the requester cannot review their own request; teachers cannot review at all", async () => {
    const f = await createSchoolFixture();
    const mon = nextMonday();
    const own = await createLeaveRequest(f.principal, leaveInput(mon, mon));
    await expect(reviewLeaveRequest(f.principal, own.id, "APPROVE")).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect((await reviewLeaveRequest(f.admin, own.id, "APPROVE")).status).toBe("APPROVED");
    const teacherLeave = await createLeaveRequest(f.teacher.auth, leaveInput(mon, mon));
    await expect(reviewLeaveRequest(f.teacher2.auth, teacherLeave.id, "APPROVE")).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(reviewLeaveRequest(f.teacher.auth, teacherLeave.id, "APPROVE")).rejects.toMatchObject({ code: "FORBIDDEN" });
    // admins may file on behalf of a teacher; teachers may not file for others
    const onBehalf = await createLeaveRequest(f.admin, leaveInput(plus(mon, 7), plus(mon, 7), { teacherId: f.teacher2.teacher.id }));
    expect(onBehalf).toMatchObject({ teacherId: f.teacher2.teacher.id, requesterUserId: f.teacher2.user.id });
    await expect(createLeaveRequest(f.teacher.auth, leaveInput(plus(mon, 14), plus(mon, 14), { teacherId: f.teacher2.teacher.id }))).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("rejection notifies the requester with LEAVE_REJECTED and creates no substitutions", async () => {
    const f = await createSchoolFixture();
    const mon = nextMonday();
    const leave = await createLeaveRequest(f.teacher.auth, leaveInput(mon, plus(mon, 1)));
    emailOutbox.sent.length = 0;
    const reviewed = await reviewLeaveRequest(f.admin, leave.id, "REJECT", "Exam week");
    expect(reviewed.status).toBe("REJECTED");
    expect((await prisma.approval.findFirstOrThrow({ where: { entityId: leave.id } })).status).toBe("REJECTED");
    expect(await prisma.substitution.count()).toBe(0);
    expect(await prisma.workflowRun.count({ where: { trigger: "LEAVE_APPROVED" } })).toBe(0);
    const note = await prisma.notification.findFirstOrThrow({ where: { userId: f.teacher.user.id, type: "LEAVE_REJECTED" } });
    expect(note).toMatchObject({ title: "Your leave request was not approved", body: "Exam week", link: `/leave/${leave.id}` });
    expect(note.emailSentAt).not.toBeNull();
    expect(emailOutbox.sent.some((m) => m.to === f.teacher.user.email && m.subject.includes("not approved"))).toBe(true);
    // a rejected request cannot be cancelled and no longer blocks a new one
    await expect(cancelLeaveRequest(f.teacher.auth, leave.id)).rejects.toMatchObject({ code: "CONFLICT" });
    await createLeaveRequest(f.teacher.auth, leaveInput(mon, plus(mon, 1)));
  });

  it("cancelling an approved request cancels its substitutions and closes the approval", async () => {
    const f = await createSchoolFixture();
    const mon = nextMonday();
    const leave = await createLeaveRequest(f.teacher.auth, leaveInput(mon, plus(mon, 2)));
    await reviewLeaveRequest(f.admin, leave.id, "APPROVE");
    await expect(cancelLeaveRequest(f.teacher2.auth, leave.id)).rejects.toMatchObject({ code: "FORBIDDEN" });
    const cancelled = await cancelLeaveRequest(f.teacher.auth, leave.id);
    expect(cancelled.status).toBe("CANCELLED");
    const subs = await prisma.substitution.findMany({ where: { leaveRequestId: leave.id } });
    expect(subs).toHaveLength(3);
    expect(subs.every((s) => s.status === "CANCELLED")).toBe(true);
    expect((await prisma.teacher.findUniqueOrThrow({ where: { id: f.teacher.teacher.id } })).status).toBe("ACTIVE");
    await expect(cancelLeaveRequest(f.teacher.auth, leave.id)).rejects.toMatchObject({ code: "CONFLICT" });

    // cancelling a pending request cancels the approval row too
    const pending = await createLeaveRequest(f.teacher.auth, leaveInput(plus(mon, 7), plus(mon, 7)));
    await cancelLeaveRequest(f.admin, pending.id);
    expect((await prisma.approval.findFirstOrThrow({ where: { entityId: pending.id } })).status).toBe("CANCELLED");
  });

  it("syncTeacherLeaveStatus toggles ON_LEAVE / ACTIVE and absentTeachers lists who is out on a date", async () => {
    const f = await createSchoolFixture();
    const today = toDateOnly(new Date());
    const leave = await createLeaveRequest(f.teacher.auth, leaveInput(plus(today, -1), plus(today, 1)));
    await reviewLeaveRequest(f.admin, leave.id, "APPROVE");
    // approving a leave that covers today marks the teacher ON_LEAVE straight away
    expect((await prisma.teacher.findUniqueOrThrow({ where: { id: f.teacher.teacher.id } })).status).toBe("ON_LEAVE");

    await prisma.teacher.update({ where: { id: f.teacher.teacher.id }, data: { status: "ACTIVE" } });
    expect(await syncTeacherLeaveStatus(f.school.id)).toEqual({ markedOnLeave: 1, markedActive: 0 });
    expect((await prisma.teacher.findUniqueOrThrow({ where: { id: f.teacher.teacher.id } })).status).toBe("ON_LEAVE");
    expect((await prisma.teacher.findUniqueOrThrow({ where: { id: f.teacher2.teacher.id } })).status).toBe("ACTIVE");
    expect(await syncTeacherLeaveStatus(f.school.id)).toEqual({ markedOnLeave: 0, markedActive: 0 });
    expect(await syncTeacherLeaveStatus(f.school.id, plus(today, 5))).toEqual({ markedOnLeave: 0, markedActive: 1 });
    expect((await prisma.teacher.findUniqueOrThrow({ where: { id: f.teacher.teacher.id } })).status).toBe("ACTIVE");

    expect((await absentTeachers(f.school.id, today)).map((l) => l.teacherId)).toEqual([f.teacher.teacher.id]);
    expect((await absentTeachers(f.school.id, plus(today, 1))).map((l) => l.teacher?.user.name)).toEqual([f.teacher.user.name]);
    expect(await absentTeachers(f.school.id, plus(today, 2))).toEqual([]);
    expect(await absentTeachers(f.school.id, plus(today, -2))).toEqual([]);
  });
});
