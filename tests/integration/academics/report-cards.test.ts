import { describe, expect, it } from "vitest";
import { createSchoolFixture, signIn, api, prisma } from "../helpers";
import { emailOutbox } from "../../setup/integration";
import { generateReportCards, getReportCard, listReportCards, publishReportCard, updateReportCard } from "@/modules/reportCards";
import { GET as getCardRoute } from "@/app/api/report-cards/[id]/route";
import { POST as publishRoute } from "@/app/api/report-cards/[id]/publish/route";

async function seedGrades(f: Awaited<ReturnType<typeof createSchoolFixture>>) {
  const assessment = await prisma.assessment.create({ data: { schoolId: f.school.id, courseId: f.course.id, termId: f.term.id, title: "Quiz", maxScore: 50 } });
  for (const [i, s] of f.students.entries()) {
    await prisma.grade.create({ data: { schoolId: f.school.id, studentId: s.student.id, courseId: f.course.id, termId: f.term.id, assessmentId: assessment.id, score: 40 + i, maxScore: 50, status: i === 2 ? "DRAFT" : "SUBMITTED" } });
  }
  const session = await prisma.attendanceSession.create({ data: { schoolId: f.school.id, courseId: f.course.id, date: new Date("2026-09-10T00:00:00Z"), status: "SUBMITTED" } });
  await prisma.attendanceRecord.createMany({ data: f.students.map((s, i) => ({ schoolId: f.school.id, sessionId: session.id, studentId: s.student.id, date: session.date, status: i === 0 ? "ABSENT" : "PRESENT" })) });
}

describe("report cards", () => {
  it("generates drafts from submitted grades and attendance, then publishes with notifications", async () => {
    const f = await createSchoolFixture();
    await seedGrades(f);
    const result = await generateReportCards(f.admin, { termId: f.term.id, classId: f.cls.id });
    expect(result).toEqual({ created: 3, refreshed: 0, skipped: 0 });
    const drafts = await listReportCards(f.admin, { termId: f.term.id });
    expect(drafts).toHaveLength(3);
    const first = drafts.find((c) => c.studentId === f.students[0].student.id)!;
    const card = await getReportCard(f.admin, first.id);
    expect(card.data.courses[0]).toMatchObject({ subject: "Mathematics", average: 80, letter: "B", graded: 1 });
    expect(card.data.attendance).toMatchObject({ total: 1, absent: 1 });
    // Draft grades are excluded from the snapshot.
    const third = drafts.find((c) => c.studentId === f.students[2].student.id)!;
    expect((await getReportCard(f.admin, third.id)).data.courses).toHaveLength(0);

    // Students/parents cannot see drafts.
    await expect(getReportCard(f.students[0].auth!, first.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(await listReportCards(f.guardian.auth, {})).toHaveLength(0);

    await updateReportCard(f.teacher.auth, first.id, { teacherComment: "Great progress." });
    await expect(updateReportCard(f.teacher.auth, first.id, { principalComment: "x" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(updateReportCard(f.teacher2.auth, first.id, { teacherComment: "nope" })).rejects.toMatchObject({ code: "FORBIDDEN" });

    emailOutbox.sent.length = 0;
    const res = await api(publishRoute, { method: "POST", cookie: await signIn(f.adminUser.email), params: { id: first.id } });
    expect(res.status).toBe(200);
    expect(res.data).toMatchObject({ status: "PUBLISHED" });
    const notes = await prisma.notification.findMany({ where: { type: "REPORT_CARD_PUBLISHED" } });
    expect(notes.map((n) => n.userId).sort()).toEqual([f.guardian.user.id, f.students[0].user!.id].sort());
    expect(emailOutbox.sent).toHaveLength(2);

    // Parent and student can now view it; the other student's parent cannot.
    const parentView = await api(getCardRoute, { cookie: await signIn(f.guardian.user.email), params: { id: first.id } });
    expect(parentView.status).toBe(200);
    expect((parentView.data as { teacherComment: string }).teacherComment).toBe("Great progress.");
    expect((await api(getCardRoute, { cookie: await signIn(f.students[1].user!.email), params: { id: first.id } })).status).toBe(403);
    expect(await listReportCards(f.guardian.auth, {})).toHaveLength(1);

    await expect(publishReportCard(f.admin, first.id)).rejects.toMatchObject({ code: "CONFLICT" });
    await expect(updateReportCard(f.admin, first.id, { teacherComment: "late" })).rejects.toMatchObject({ code: "CONFLICT" });
    expect(await generateReportCards(f.admin, { termId: f.term.id, classId: f.cls.id })).toEqual({ created: 0, refreshed: 2, skipped: 1 });
  });

  it("only administrators can generate and publish; teachers can read their students' cards", async () => {
    const f = await createSchoolFixture();
    await expect(generateReportCards(f.teacher.auth, { termId: f.term.id, classId: f.cls.id })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await generateReportCards(f.admin, { termId: f.term.id, studentId: f.students[0].student.id });
    const [card] = await listReportCards(f.teacher.auth, {});
    expect(card.studentId).toBe(f.students[0].student.id);
    await expect(publishReportCard(f.teacher.auth, card.id)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(generateReportCards(f.admin, { termId: "nope", classId: f.cls.id })).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});
