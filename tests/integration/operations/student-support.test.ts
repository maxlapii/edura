import { describe, expect, it } from "vitest";
import { createSchoolFixture, createOtherSchool, createStudent, createUser, asUser, signIn, api, prisma } from "../helpers";
import { addSupportCaseNote, assignSupportCase, createSupportCase, getSupportCase, listSupportCases, updateSupportCase, updateSupportCaseStatus } from "@/modules/supportCases/service";
import { createIncident, getIncident, listIncidents, updateIncident } from "@/modules/discipline/service";
import { POST as postCase, GET as getCases } from "@/app/api/support-cases/route";
import { GET as getCaseRoute } from "@/app/api/support-cases/[id]/route";
import { POST as noteRoute } from "@/app/api/support-cases/[id]/notes/route";
import { POST as caseStatusRoute } from "@/app/api/support-cases/[id]/status/route";
import { POST as postIncident, GET as getIncidents } from "@/app/api/discipline/route";
import * as incidentRoute from "@/app/api/discipline/[id]/route";
import { toDateOnly } from "@/lib/utils/dates";

const DAY = 86_400_000;

describe("student support cases", () => {
  it("class teachers create cases for their students; unrelated teachers, students and parents cannot", async () => {
    const f = await createSchoolFixture();
    const res = await api(postCase, { cookie: await signIn(f.teacher.user.email), body: { studentId: f.students[0].student.id, category: "ACADEMIC", title: "Falling behind", description: "Struggles with fractions" } });
    expect(res.status).toBe(201);
    expect(res.data).toMatchObject({ status: "OPEN", category: "ACADEMIC", createdBy: { id: f.teacher.user.id }, redacted: false, assignedToUserId: null, student: { id: f.students[0].student.id } });

    const input = { studentId: f.students[0].student.id, category: "OTHER" as const, title: "x", isSensitive: false };
    await expect(createSupportCase(f.teacher2.auth, input)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(createSupportCase(f.students[0].auth!, input)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(createSupportCase(f.guardian.auth, input)).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect((await api(postCase, { cookie: await signIn(f.students[0].user!.email), body: input })).status).toBe(403);
    expect((await api(getCases, { cookie: await signIn(f.guardian.user.email) })).status).toBe(403);
    const other = await createOtherSchool();
    await expect(createSupportCase(other.admin, input)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(createSupportCase(f.admin, { ...input, studentId: "missing" })).rejects.toMatchObject({ code: "NOT_FOUND" });
    // assignees must be school staff
    await expect(createSupportCase(f.admin, { ...input, assignedToUserId: f.students[1].user!.id })).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    await expect(createSupportCase(f.admin, { ...input, assignedToUserId: other.teacher.user.id })).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    expect(await prisma.supportCase.count()).toBe(1);
  });

  it("sensitive cases are redacted for teachers who are neither creator nor assignee", async () => {
    const f = await createSchoolFixture();
    const c = await createSupportCase(f.admin, { studentId: f.students[0].student.id, category: "WELLBEING", title: "Family situation", description: "Confidential details", isSensitive: true, assignedToUserId: f.teacher2.user.id });
    expect(c.status).toBe("ASSIGNED");
    // the assignee was notified
    const notes = await prisma.notification.findMany({ where: { userId: f.teacher2.user.id } });
    expect(notes.map((n) => n.title)).toEqual(["Support case assigned: Family situation"]);
    await addSupportCaseNote(f.admin, c.id, { body: "Spoke with the counsellor" });

    // class teacher can access the student, but is neither creator nor assignee → redacted
    const teacherView = await getSupportCase(f.teacher.auth, c.id);
    expect(teacherView).toMatchObject({ id: c.id, title: "Family situation", redacted: true, description: null, notes: [] });
    const viaRoute = await api(getCaseRoute, { cookie: await signIn(f.teacher.user.email), params: { id: c.id } });
    expect(viaRoute.status).toBe(200);
    expect(viaRoute.data).toMatchObject({ redacted: true, description: null, notes: [] });
    const listed = await listSupportCases(f.teacher.auth);
    expect(listed.map((x) => [x.id, x.redacted, x.description])).toEqual([[c.id, true, null]]);

    // admin (support_cases:read_sensitive) and the assignee see everything
    const adminView = await getSupportCase(f.admin, c.id);
    expect(adminView).toMatchObject({ redacted: false, description: "Confidential details" });
    expect(adminView.notes.map((n) => n.body)).toEqual(["Spoke with the counsellor"]);
    const assigneeView = await getSupportCase(f.teacher2.auth, c.id);
    expect(assigneeView).toMatchObject({ redacted: false, description: "Confidential details" });
    expect(assigneeView.notes).toHaveLength(1);
    // the audit trail never stores the sensitive description
    const log = await prisma.auditLog.findFirstOrThrow({ where: { action: "support_case.create", entityId: c.id } });
    expect(JSON.stringify(log.after)).not.toContain("Confidential details");
    expect((log.after as { description: string }).description).toBe("[sensitive]");

    // non-sensitive cases are never redacted
    const plain = await createSupportCase(f.admin, { studentId: f.students[0].student.id, category: "ACADEMIC", title: "Plain", description: "Visible", isSensitive: false });
    expect(await getSupportCase(f.teacher.auth, plain.id)).toMatchObject({ redacted: false, description: "Visible" });
    // teachers who cannot access the student and are not involved get FORBIDDEN
    const outsider = await createStudent(f.school.id, null);
    const hidden = await createSupportCase(f.admin, { studentId: outsider.student.id, category: "OTHER", title: "Hidden", isSensitive: false });
    await expect(getSupportCase(f.teacher.auth, hidden.id)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(getSupportCase(f.students[0].auth!, plain.id)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(getSupportCase(f.guardian.auth, plain.id)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("notes with a follow-up date move the case to FOLLOW_UP and create a task for the assignee", async () => {
    const f = await createSchoolFixture();
    const c = await createSupportCase(f.teacher.auth, { studentId: f.students[0].student.id, category: "ATTENDANCE", title: "Repeated lateness", isSensitive: false, assignedToUserId: f.teacher2.user.id });
    expect(await prisma.task.count()).toBe(0); // no followUpDate yet → no task

    // only creator/assignee/admin may add notes
    const stranger = await createUser("STAFF", f.school.id);
    await expect(addSupportCaseNote(await asUser(stranger.id), c.id, { body: "x" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    const followUp = new Date(Date.now() + 5 * DAY);
    const res = await api(noteRoute, { cookie: await signIn(f.teacher2.user.email), params: { id: c.id }, body: { body: "Called home", followUpDate: followUp } });
    expect(res.status).toBe(201);
    expect(res.data).toMatchObject({ caseId: c.id, authorUserId: f.teacher2.user.id, body: "Called home" });

    const updated = await prisma.supportCase.findUniqueOrThrow({ where: { id: c.id } });
    expect(updated.status).toBe("FOLLOW_UP");
    expect(updated.followUpDate?.getTime()).toBe(followUp.getTime());
    const tasks = await prisma.task.findMany({ where: { source: "STUDENT_SUPPORT", sourceId: c.id } });
    expect(tasks).toHaveLength(1);
    expect(tasks[0]).toMatchObject({ assigneeUserId: f.teacher2.user.id, title: "Follow up support case: Repeated lateness", createdByUserId: f.teacher2.user.id, status: "TODO" });
    expect(tasks[0].dueDate?.getTime()).toBe(followUp.getTime());

    // a note without follow-up leaves status alone; assigning with a follow-up date creates another task
    await addSupportCaseNote(f.teacher.auth, c.id, { body: "Plain note" });
    expect((await prisma.supportCase.findUniqueOrThrow({ where: { id: c.id } })).status).toBe("FOLLOW_UP");
    expect((await getSupportCase(f.admin, c.id)).notes.map((n) => n.body)).toEqual(["Called home", "Plain note"]);
    await expect(assignSupportCase(f.teacher2.auth, c.id, { assignedToUserId: f.teacher.user.id })).rejects.toMatchObject({ code: "FORBIDDEN" }); // assignee is not creator
    const reassigned = await assignSupportCase(f.teacher.auth, c.id, { assignedToUserId: f.teacher.user.id });
    expect(reassigned.assignedToUserId).toBe(f.teacher.user.id);
    expect(await prisma.task.count({ where: { source: "STUDENT_SUPPORT", sourceId: c.id, assigneeUserId: f.teacher.user.id } })).toBe(1);
    // creating with assignee + followUpDate creates a task straight away
    const c2 = await createSupportCase(f.admin, { studentId: f.students[1].student.id, category: "OTHER", title: "Immediate", isSensitive: false, assignedToUserId: f.teacher.user.id, followUpDate: followUp });
    expect(await prisma.task.count({ where: { source: "STUDENT_SUPPORT", sourceId: c2.id } })).toBe(1);
  });

  it("status transitions: RESOLVED sets resolvedAt, reopening clears it; only involved staff may change it", async () => {
    const f = await createSchoolFixture();
    const c = await createSupportCase(f.admin, { studentId: f.students[0].student.id, category: "BEHAVIOR", title: "Disruptive", isSensitive: false });
    // class teacher can view but is not creator/assignee → cannot change status or edit
    await expect(updateSupportCaseStatus(f.teacher.auth, c.id, { status: "IN_PROGRESS" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(updateSupportCase(f.teacher.auth, c.id, { title: "x" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect((await api(caseStatusRoute, { cookie: await signIn(f.teacher.user.email), params: { id: c.id }, body: { status: "RESOLVED" } })).status).toBe(403);

    const inProgress = await api(caseStatusRoute, { cookie: await signIn(f.adminUser.email), params: { id: c.id }, body: { status: "IN_PROGRESS" } });
    expect(inProgress.status).toBe(200);
    expect(inProgress.data).toMatchObject({ status: "IN_PROGRESS", resolvedAt: null });

    const resolved = await updateSupportCaseStatus(f.admin, c.id, { status: "RESOLVED" });
    expect(resolved.status).toBe("RESOLVED");
    expect(resolved.resolvedAt).toBeInstanceOf(Date);
    const resolvedAt = resolved.resolvedAt!.getTime();
    // resolving again keeps the original timestamp; a follow-up note on a resolved case does not reopen it
    expect((await updateSupportCaseStatus(f.admin, c.id, { status: "RESOLVED" })).resolvedAt?.getTime()).toBe(resolvedAt);
    await addSupportCaseNote(f.admin, c.id, { body: "Check next term", followUpDate: new Date(Date.now() + 30 * DAY) });
    expect((await prisma.supportCase.findUniqueOrThrow({ where: { id: c.id } })).status).toBe("RESOLVED");
    const reopened = await updateSupportCaseStatus(f.principal, c.id, { status: "FOLLOW_UP" });
    expect(reopened.status).toBe("FOLLOW_UP");
    expect(reopened.resolvedAt).toBeNull();
    expect((await updateSupportCase(f.admin, c.id, { title: "Disruptive (updated)", isSensitive: true })).title).toBe("Disruptive (updated)");
    expect(await prisma.auditLog.count({ where: { action: "support_case.status", entityId: c.id } })).toBe(4);
    const invalid = await api(caseStatusRoute, { cookie: await signIn(f.adminUser.email), params: { id: c.id }, body: { status: "CLOSED" } });
    expect(invalid.status).toBe(422);
  });

  it("lists are scoped: admins see the school, teachers see accessible students plus own/assigned cases", async () => {
    const f = await createSchoolFixture();
    const otherClass = await prisma.schoolClass.create({ data: { schoolId: f.school.id, academicYearId: f.year.id, name: "10B" } });
    const outsider = await createStudent(f.school.id, otherClass.id);
    const mine = await createSupportCase(f.teacher.auth, { studentId: f.students[0].student.id, category: "ACADEMIC", title: "Mine", isSensitive: false });
    const forMyStudent = await createSupportCase(f.admin, { studentId: f.students[1].student.id, category: "OTHER", title: "Admin's on my student", isSensitive: false });
    const assignedToTeacher2 = await createSupportCase(f.admin, { studentId: outsider.student.id, category: "OTHER", title: "Assigned to teacher 2", isSensitive: false, assignedToUserId: f.teacher2.user.id });
    const unrelated = await createSupportCase(f.admin, { studentId: outsider.student.id, category: "BEHAVIOR", title: "Unrelated", isSensitive: false });
    const other = await createOtherSchool();
    await createSupportCase(other.admin, { studentId: other.student.student.id, category: "OTHER", title: "Elsewhere", isSensitive: false });

    const ids = (rows: Array<{ id: string }>) => rows.map((r) => r.id).sort();
    expect(ids(await listSupportCases(f.admin))).toEqual([mine.id, forMyStudent.id, assignedToTeacher2.id, unrelated.id].sort());
    expect(ids(await listSupportCases(f.teacher.auth))).toEqual([mine.id, forMyStudent.id].sort());
    expect(ids(await listSupportCases(f.teacher2.auth))).toEqual([assignedToTeacher2.id]);
    expect(ids(await listSupportCases(other.admin))).toHaveLength(1);
    expect(ids(await listSupportCases(f.admin, { studentId: outsider.student.id }))).toEqual([assignedToTeacher2.id, unrelated.id].sort());
    expect(ids(await listSupportCases(f.admin, { status: "ASSIGNED" }))).toEqual([assignedToTeacher2.id]);
    expect(ids(await listSupportCases(f.admin, { category: "ACADEMIC" }))).toEqual([mine.id]);
    expect(ids(await listSupportCases(f.admin, { assignedToUserId: f.teacher2.user.id }))).toEqual([assignedToTeacher2.id]);
    const res = await api(getCases, { cookie: await signIn(f.teacher.user.email), query: { studentId: f.students[0].student.id } });
    expect(res.status).toBe(200);
    expect(ids(res.data as Array<{ id: string }>)).toEqual([mine.id]);
    // staff (non-teaching) see the whole school as well
    const staff = await asUser((await createUser("STAFF", f.school.id)).id);
    expect(ids(await listSupportCases(staff))).toHaveLength(4);
  });
});

describe("discipline incidents", () => {
  const incident = (studentId: string) => ({ studentId, category: "Disruption", date: toDateOnly("2026-09-25"), severity: "MODERATE" as const, description: "Threw a chair across the room", actions: "Sent to the office", parentNotified: true, followUp: null });

  it("createIncident with parentNotified notifies guardians without the incident details", async () => {
    const f = await createSchoolFixture();
    const res = await api(postIncident, { cookie: await signIn(f.teacher.user.email), body: { ...incident(f.students[0].student.id), date: "2026-09-25" } });
    expect(res.status).toBe(201);
    const created = res.data as { id: string; reportedBy: { id: string }; parentNotified: boolean; date: string; student: { id: string } };
    expect(created).toMatchObject({ reportedBy: { id: f.teacher.user.id }, parentNotified: true, student: { id: f.students[0].student.id } });
    expect(created.date).toBe("2026-09-25T00:00:00.000Z");

    const notes = await prisma.notification.findMany({ where: { userId: f.guardian.user.id } });
    expect(notes).toHaveLength(1);
    expect(notes[0].title).toBe("Behaviour incident recorded");
    expect(notes[0].body).toContain("Kid1 Tester");
    expect(notes[0].body).toContain("2026-09-25");
    expect(notes[0].body).not.toContain("chair");
    expect(notes[0].body).not.toContain("Disruption");
    expect(notes[0].body).not.toContain("MODERATE");
    expect(notes[0].link).toBe(`/students/${f.students[0].student.id}`);

    // no notification when parentNotified is false, or when the student has no guardian
    await prisma.notification.deleteMany({});
    await createIncident(f.teacher.auth, { ...incident(f.students[0].student.id), parentNotified: false });
    await createIncident(f.teacher.auth, { ...incident(f.students[1].student.id), parentNotified: true });
    expect(await prisma.notification.count()).toBe(0);
    expect(await prisma.auditLog.count({ where: { action: "discipline.create" } })).toBe(3);

    // teachers of unrelated classes, students, parents and other schools cannot report
    await expect(createIncident(f.teacher2.auth, incident(f.students[0].student.id))).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(createIncident(f.students[0].auth!, incident(f.students[0].student.id))).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(createIncident(f.guardian.auth, incident(f.students[0].student.id))).rejects.toMatchObject({ code: "FORBIDDEN" });
    const other = await createOtherSchool();
    await expect(createIncident(other.admin, incident(f.students[0].student.id))).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("updates are audited with before/after, restricted to the reporter or admins, and notify on parentNotified flip", async () => {
    const f = await createSchoolFixture();
    const created = await createIncident(f.teacher.auth, { ...incident(f.students[0].student.id), parentNotified: false });
    await expect(updateIncident(f.teacher2.auth, created.id, { severity: "MAJOR" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    const other = await createOtherSchool();
    await expect(updateIncident(other.admin, created.id, { severity: "MAJOR" })).rejects.toMatchObject({ code: "FORBIDDEN" });

    const res = await api(incidentRoute.PATCH, { cookie: await signIn(f.teacher.user.email), method: "PATCH", params: { id: created.id }, body: { severity: "MAJOR", parentNotified: true, date: "2026-09-24" } });
    expect(res.status).toBe(200);
    expect(res.data).toMatchObject({ severity: "MAJOR", parentNotified: true, date: "2026-09-24T00:00:00.000Z" });

    const log = await prisma.auditLog.findFirstOrThrow({ where: { action: "discipline.update", entityId: created.id } });
    expect(log.userId).toBe(f.teacher.user.id);
    expect(log.schoolId).toBe(f.school.id);
    expect(log.before).toMatchObject({ severity: "MODERATE", parentNotified: false });
    expect(log.after).toMatchObject({ severity: "MAJOR", parentNotified: true });
    // flipping parentNotified notified the guardian once
    expect(await prisma.notification.count({ where: { userId: f.guardian.user.id, title: "Behaviour incident recorded" } })).toBe(1);
    await updateIncident(f.admin, created.id, { actions: "Detention" });
    expect(await prisma.notification.count({ where: { userId: f.guardian.user.id } })).toBe(1);
    expect(await prisma.auditLog.count({ where: { action: "discipline.update", entityId: created.id } })).toBe(2);
    await expect(updateIncident(f.admin, "missing", { actions: "x" })).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("parents and students list only their own student (studentId required); staff scoped by accessible students", async () => {
    const f = await createSchoolFixture();
    const otherClass = await prisma.schoolClass.create({ data: { schoolId: f.school.id, academicYearId: f.year.id, name: "10B" } });
    const outsider = await createStudent(f.school.id, otherClass.id);
    const kid1 = await createIncident(f.teacher.auth, incident(f.students[0].student.id));
    const kid2 = await createIncident(f.admin, { ...incident(f.students[1].student.id), severity: "MINOR" });
    const out = await createIncident(f.admin, incident(outsider.student.id));

    // parent
    await expect(listIncidents(f.guardian.auth)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(listIncidents(f.guardian.auth, { studentId: f.students[1].student.id })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect((await listIncidents(f.guardian.auth, { studentId: f.students[0].student.id })).map((i) => i.id)).toEqual([kid1.id]);
    const parentRoute = await api(getIncidents, { cookie: await signIn(f.guardian.user.email), query: { studentId: f.students[0].student.id } });
    expect(parentRoute.status).toBe(200);
    expect((parentRoute.data as Array<{ id: string }>).map((i) => i.id)).toEqual([kid1.id]);
    expect((await api(getIncidents, { cookie: await signIn(f.guardian.user.email) })).status).toBe(403);
    expect((await api(getIncidents, { cookie: await signIn(f.guardian.user.email), query: { studentId: f.students[1].student.id } })).status).toBe(403);
    expect((await getIncident(f.guardian.auth, kid1.id)).id).toBe(kid1.id);
    await expect(getIncident(f.guardian.auth, kid2.id)).rejects.toMatchObject({ code: "FORBIDDEN" });

    // student
    expect((await listIncidents(f.students[1].auth!, { studentId: f.students[1].student.id })).map((i) => i.id)).toEqual([kid2.id]);
    await expect(listIncidents(f.students[1].auth!, { studentId: f.students[0].student.id })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(listIncidents(f.students[1].auth!)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(getIncident(f.students[1].auth!, kid1.id)).rejects.toMatchObject({ code: "FORBIDDEN" });

    // teachers: accessible students only; admins: whole school
    expect((await listIncidents(f.teacher.auth)).map((i) => i.id).sort()).toEqual([kid1.id, kid2.id].sort());
    expect(await listIncidents(f.teacher2.auth)).toEqual([]);
    await expect(getIncident(f.teacher2.auth, kid1.id)).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect((await listIncidents(f.admin)).map((i) => i.id).sort()).toEqual([kid1.id, kid2.id, out.id].sort());
    expect((await listIncidents(f.admin, { severity: "MINOR" })).map((i) => i.id)).toEqual([kid2.id]);
    expect((await listIncidents(f.admin, { from: toDateOnly("2026-09-26") }))).toEqual([]);
    expect((await listIncidents(f.admin, { studentId: outsider.student.id })).map((i) => i.id)).toEqual([out.id]);
    const other = await createOtherSchool();
    expect(await listIncidents(other.admin)).toEqual([]);
    await expect(getIncident(other.admin, kid1.id)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("incidents can never be deleted through the API", async () => {
    expect((incidentRoute as Record<string, unknown>).DELETE).toBeUndefined();
    expect(typeof incidentRoute.GET).toBe("function");
    expect(typeof incidentRoute.PATCH).toBe("function");
  });
});
