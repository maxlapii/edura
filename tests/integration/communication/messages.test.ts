import { describe, expect, it } from "vitest";
import { createSchoolFixture, createOtherSchool, createStudent, createTeacher, createUser, asUser, signIn, api, prisma } from "../helpers";
import { createTemplate, deleteTemplate, getMessage, inbox, listTemplates, markRead, renderTemplateForStudent, resolveMessageRecipients, sendMessage, sent, unreadCount, updateTemplate } from "@/modules/communication/service";
import { POST as postMessage, GET as getMessages } from "@/app/api/messages/route";
import { GET as getMessageRoute } from "@/app/api/messages/[id]/route";
import { POST as markReadRoute } from "@/app/api/messages/[id]/read/route";
import { GET as unreadCountRoute } from "@/app/api/messages/unread-count/route";
import { POST as postTemplate, GET as getTemplates } from "@/app/api/message-templates/route";
import { PATCH as patchTemplate, DELETE as deleteTemplateRoute } from "@/app/api/message-templates/[id]/route";
import { GET as renderRoute } from "@/app/api/message-templates/[id]/render/route";
import { formatDate } from "@/lib/utils/dates";

const sortIds = (ids: string[]) => [...ids].sort();

describe("messages", () => {
  it("a teacher sends to explicit users: recipient rows and MESSAGE notifications are created", async () => {
    const f = await createSchoolFixture();
    const res = await api(postMessage, {
      cookie: await signIn(f.teacher.user.email),
      body: { subject: "Homework reminder", body: "Please hand in the fractions sheet tomorrow.", recipients: { userIds: [f.students[0].user!.id, f.guardian.user.id, f.teacher.user.id] } },
    });
    expect(res.status).toBe(201);
    const message = res.data as { id: string; senderUserId: string; recipients: Array<{ userId: string; readAt: string | null }>; _count: { recipients: number } };
    expect(message.senderUserId).toBe(f.teacher.user.id);
    // the sender is never a recipient of their own message
    expect(sortIds(message.recipients.map((r) => r.userId))).toEqual(sortIds([f.students[0].user!.id, f.guardian.user.id]));
    expect(message._count.recipients).toBe(2);
    expect(message.recipients.every((r) => r.readAt === null)).toBe(true);

    const notes = await prisma.notification.findMany({ where: { type: "MESSAGE" } });
    expect(sortIds(notes.map((n) => n.userId))).toEqual(sortIds([f.students[0].user!.id, f.guardian.user.id]));
    expect(notes[0]).toMatchObject({ title: `New message from ${f.teacher.user.name}: Homework reminder`, body: "Please hand in the fractions sheet tomorrow.", link: `/messages/${message.id}` });
    expect(await prisma.auditLog.count({ where: { action: "message.send", entityId: message.id } })).toBe(1);

    // validation through the route
    expect((await api(postMessage, { cookie: await signIn(f.teacher.user.email), body: { subject: "x", body: "y", recipients: {} } })).status).toBe(422);
    expect((await api(postMessage, { cookie: await signIn(f.teacher.user.email), body: { subject: "", body: "y", recipients: { userIds: [f.guardian.user.id] } } })).status).toBe(422);
  });

  it("classId expands to the class's students (with logins) and their guardians; departmentId to the department's teachers", async () => {
    const f = await createSchoolFixture();
    const noLogin = await createStudent(f.school.id, f.cls.id, { withLogin: false });
    const inactive = await createStudent(f.school.id, f.cls.id);
    await prisma.student.update({ where: { id: inactive.student.id }, data: { status: "INACTIVE" } });
    const classMessage = await sendMessage(f.teacher.auth, { subject: "Class trip", body: "Bring a packed lunch.", recipients: { classId: f.cls.id } });
    const expected = [...f.students.map((s) => s.user!.id), f.guardian.user.id];
    expect(sortIds(classMessage.recipients.map((r) => r.userId))).toEqual(sortIds(expected));
    expect(noLogin.user).toBeNull();
    expect(classMessage.recipients.some((r) => r.userId === inactive.user!.id)).toBe(false);

    const scienceTeacher = await createTeacher(f.school.id, { departmentId: null });
    const deptMessage = await sendMessage(f.admin, { subject: "Maths dept", body: "Meeting Friday.", recipients: { departmentId: f.department.id } });
    expect(sortIds(deptMessage.recipients.map((r) => r.userId))).toEqual(sortIds([f.teacher.user.id, f.teacher2.user.id]));
    expect(deptMessage.recipients.some((r) => r.userId === scienceTeacher.user.id)).toBe(false);
    // when the sender is in the department they are excluded from their own message
    const fromInside = await sendMessage(f.teacher.auth, { subject: "Hi dept", body: "x", recipients: { departmentId: f.department.id } });
    expect(fromInside.recipients.map((r) => r.userId)).toEqual([f.teacher2.user.id]);
    // combined targets are de-duplicated
    const combined = await sendMessage(f.admin, { subject: "Both", body: "x", recipients: { classId: f.cls.id, userIds: [f.students[0].user!.id, f.teacher.user.id] } });
    expect(sortIds(combined.recipients.map((r) => r.userId))).toEqual(sortIds([...expected, f.teacher.user.id]));

    const other = await createOtherSchool();
    await expect(sendMessage(f.admin, { subject: "x", body: "y", recipients: { classId: other.cls.id } })).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    const otherDept = await prisma.department.create({ data: { schoolId: other.school.id, name: "Theirs", code: "TH" } });
    await expect(sendMessage(f.admin, { subject: "x", body: "y", recipients: { departmentId: otherDept.id } })).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    // an empty class resolves no recipients
    const emptyClass = await prisma.schoolClass.create({ data: { schoolId: f.school.id, academicYearId: f.year.id, name: "Empty" } });
    await expect(sendMessage(f.admin, { subject: "x", body: "y", recipients: { classId: emptyClass.id } })).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("audience messages are for administrators only", async () => {
    const f = await createSchoolFixture();
    await expect(sendMessage(f.teacher.auth, { subject: "x", body: "y", recipients: { audience: "TEACHERS" } })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect((await api(postMessage, { cookie: await signIn(f.teacher.user.email), body: { subject: "x", body: "y", recipients: { audience: "PARENTS" } } })).status).toBe(403);
    await prisma.department.update({ where: { id: f.department.id }, data: { headTeacherId: f.teacher2.teacher.id } });
    await prisma.user.update({ where: { id: f.teacher2.user.id }, data: { role: "DEPARTMENT_HEAD" } });
    const head = await asUser(f.teacher2.user.id);
    await expect(sendMessage(head, { subject: "x", body: "y", recipients: { audience: "TEACHERS" } })).rejects.toMatchObject({ code: "FORBIDDEN" });

    const toTeachers = await sendMessage(f.admin, { subject: "All teachers", body: "Staff room is closed.", recipients: { audience: "TEACHERS" } });
    expect(sortIds(toTeachers.recipients.map((r) => r.userId))).toEqual(sortIds([f.teacher.user.id, f.teacher2.user.id]));
    const toParents = await sendMessage(f.principal, { subject: "Parents", body: "x", recipients: { audience: "PARENTS" } });
    expect(toParents.recipients.map((r) => r.userId)).toEqual([f.guardian.user.id]);
    const toStudents = await sendMessage(f.admin, { subject: "Students", body: "x", recipients: { audience: "STUDENTS" } });
    expect(toStudents.recipients).toHaveLength(3);
    await expect(sendMessage(f.admin, { subject: "Staff", body: "x", recipients: { audience: "STAFF" } })).rejects.toMatchObject({ code: "VALIDATION_ERROR" }); // no staff yet
    expect(await prisma.notification.count({ where: { type: "MESSAGE" } })).toBe(6);
  });

  it("students may message their teachers and administrators but not other students", async () => {
    const f = await createSchoolFixture();
    const student = f.students[0].auth!;
    const ok = await sendMessage(student, { subject: "Question", body: "About the homework", recipients: { userIds: [f.teacher.user.id, f.adminUser.id] } });
    expect(sortIds(ok.recipients.map((r) => r.userId))).toEqual(sortIds([f.teacher.user.id, f.adminUser.id]));
    expect(await prisma.notification.count({ where: { userId: f.teacher.user.id, type: "MESSAGE" } })).toBe(1);

    await expect(sendMessage(student, { subject: "Psst", body: "x", recipients: { userIds: [f.students[1].user!.id] } })).rejects.toMatchObject({ code: "FORBIDDEN" });
    // a mixed list is rejected as a whole
    await expect(sendMessage(student, { subject: "Psst", body: "x", recipients: { userIds: [f.teacher.user.id, f.students[1].user!.id] } })).rejects.toMatchObject({ code: "FORBIDDEN" });
    // teacher2 does not teach the student
    await expect(sendMessage(student, { subject: "Hi", body: "x", recipients: { userIds: [f.teacher2.user.id] } })).rejects.toMatchObject({ code: "FORBIDDEN" });
    // group targets are staff-only
    await expect(sendMessage(student, { subject: "Hi", body: "x", recipients: { classId: f.cls.id } })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(sendMessage(student, { subject: "Hi", body: "x", recipients: { audience: "TEACHERS" } })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect((await api(postMessage, { cookie: await signIn(f.students[0].user!.email), body: { subject: "x", body: "y", recipients: { userIds: [f.students[2].user!.id] } } })).status).toBe(403);
    expect(await prisma.message.count()).toBe(1);
  });

  it("parents may message their child's teachers (course + homeroom) but not unrelated teachers", async () => {
    const f = await createSchoolFixture();
    const homeroomOnly = await createTeacher(f.school.id);
    const otherClass = await prisma.schoolClass.create({ data: { schoolId: f.school.id, academicYearId: f.year.id, name: "10B", homeroomTeacherId: homeroomOnly.teacher.id } });
    const secondChild = await createStudent(f.school.id, otherClass.id);
    await prisma.studentGuardian.create({ data: { guardianId: f.guardian.guardian.id, studentId: secondChild.student.id } });
    const parent = await asUser(f.guardian.user.id);

    const ok = await sendMessage(parent, { subject: "Absence", body: "Kid1 is ill today.", recipients: { userIds: [f.teacher.user.id, homeroomOnly.user.id, f.principal.id] } });
    expect(sortIds(ok.recipients.map((r) => r.userId))).toEqual(sortIds([f.teacher.user.id, homeroomOnly.user.id, f.principal.id]));
    await expect(sendMessage(parent, { subject: "Hi", body: "x", recipients: { userIds: [f.teacher2.user.id] } })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(sendMessage(parent, { subject: "Hi", body: "x", recipients: { userIds: [f.students[1].user!.id] } })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(sendMessage(parent, { subject: "Hi", body: "x", recipients: { departmentId: f.department.id } })).rejects.toMatchObject({ code: "FORBIDDEN" });
    // a guardian without children may only write to administrators
    const lonely = await prisma.guardian.create({ data: { schoolId: f.school.id, userId: (await createUser("PARENT", f.school.id)).id } });
    const lonelyAuth = await asUser(lonely.userId);
    await expect(sendMessage(lonelyAuth, { subject: "Hi", body: "x", recipients: { userIds: [f.teacher.user.id] } })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect((await sendMessage(lonelyAuth, { subject: "Hi", body: "x", recipients: { userIds: [f.adminUser.id] } })).recipients).toHaveLength(1);
  });

  it("recipients from another school are rejected", async () => {
    const f = await createSchoolFixture();
    const other = await createOtherSchool();
    await expect(sendMessage(f.admin, { subject: "x", body: "y", recipients: { userIds: [other.teacher.user.id] } })).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    await expect(sendMessage(f.teacher.auth, { subject: "x", body: "y", recipients: { userIds: [f.teacher2.user.id, other.admin.id] } })).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    await expect(resolveMessageRecipients(f.admin, f.school.id, { userIds: [other.student.user!.id] })).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    // deactivated users are not valid recipients either
    await prisma.user.update({ where: { id: f.teacher2.user.id }, data: { isActive: false } });
    await expect(sendMessage(f.admin, { subject: "x", body: "y", recipients: { userIds: [f.teacher2.user.id] } })).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    expect(await prisma.message.count()).toBe(0);
    // a message from the other school is invisible here
    const theirs = await sendMessage(other.admin, { subject: "Theirs", body: "x", recipients: { userIds: [other.teacher.user.id] } });
    await expect(getMessage(f.admin, theirs.id)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("inbox/sent/unreadCount; reading marks as read; non-recipients cannot read; threads", async () => {
    const f = await createSchoolFixture();
    const m1 = await sendMessage(f.teacher.auth, { subject: "First", body: "Hello", recipients: { userIds: [f.guardian.user.id, f.students[0].user!.id] } });
    const m2 = await sendMessage(f.admin, { subject: "Second", body: "World", recipients: { userIds: [f.guardian.user.id] } });

    const parentInbox = await inbox(f.guardian.auth);
    expect(parentInbox.map((m) => m.id)).toEqual([m2.id, m1.id]);
    expect(parentInbox.every((m) => m.readAt === null)).toBe(true);
    expect(parentInbox[1]._count.recipients).toBe(2);
    expect(await unreadCount(f.guardian.user.id)).toBe(2);
    expect((await sent(f.teacher.auth)).map((m) => m.id)).toEqual([m1.id]);
    expect(await sent(f.guardian.auth)).toEqual([]);
    expect(await inbox(f.teacher.auth)).toEqual([]);

    const cookie = await signIn(f.guardian.user.email);
    const listed = await api(getMessages, { cookie, query: { box: "inbox", unreadOnly: "true" } });
    expect(listed.status).toBe(200);
    expect((listed.data as Array<{ id: string }>).map((m) => m.id)).toEqual([m2.id, m1.id]);
    expect((await api(unreadCountRoute, { cookie })).data).toEqual({ count: 2 });

    // reading marks it read for that recipient only
    const read = await api(getMessageRoute, { cookie, params: { id: m1.id } });
    expect(read.status).toBe(200);
    expect((read.data as { readAt: string | null; subject: string }).subject).toBe("First");
    expect((read.data as { readAt: string | null }).readAt).not.toBeNull();
    expect(await unreadCount(f.guardian.user.id)).toBe(1);
    expect(await unreadCount(f.students[0].user!.id)).toBe(1);
    expect((await inbox(f.guardian.auth, { unreadOnly: true })).map((m) => m.id)).toEqual([m2.id]);
    // sender can read without a receipt
    expect((await getMessage(f.teacher.auth, m1.id)).readAt).toBeNull();
    // non-recipients cannot
    await expect(getMessage(f.teacher2.auth, m1.id)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(getMessage(f.students[1].auth!, m1.id)).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect((await api(getMessageRoute, { cookie: await signIn(f.teacher2.user.email), params: { id: m1.id } })).status).toBe(403);
    await expect(getMessage(f.admin, "missing")).rejects.toMatchObject({ code: "NOT_FOUND" });

    // explicit markRead
    const marked = await api(markReadRoute, { cookie, params: { id: m2.id } });
    expect(marked.data).toEqual({ updated: 1 });
    expect((await api(markReadRoute, { cookie, params: { id: m2.id } })).data).toEqual({ updated: 0 });
    expect(await unreadCount(f.guardian.user.id)).toBe(0);
    expect((await markRead(f.teacher2.auth, m1.id)).updated).toBe(0);

    // replies in a thread are visible to thread members only
    const reply = await sendMessage(f.guardian.auth, { subject: "Re: First", body: "Thanks", recipients: { userIds: [f.teacher.user.id] }, threadId: m1.id });
    expect(reply.threadId).toBe(m1.id);
    const withThread = await getMessage(f.teacher.auth, reply.id);
    expect(withThread.thread.map((t) => t.id)).toEqual([m1.id]);
    await expect(sendMessage(f.teacher2.auth, { subject: "Re", body: "x", recipients: { userIds: [f.teacher.user.id] }, threadId: m1.id })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(sendMessage(f.teacher.auth, { subject: "Re", body: "x", recipients: { userIds: [f.guardian.user.id] }, threadId: "missing" })).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("templates: CRUD for staff, rendering substitutes student variables, students cannot manage them", async () => {
    const f = await createSchoolFixture();
    const cookie = await signIn(f.teacher.user.email);
    const created = await api(postTemplate, {
      cookie,
      body: { name: "Absence note", category: "ATTENDANCE", subject: "{{studentName}} absent", body: "Dear parent, {{studentName}} ({{className}}) was absent on {{date}}. Regards, {{teacherName}}. {{unknown}}" },
    });
    expect(created.status).toBe(201);
    const template = created.data as { id: string; schoolId: string; name: string };
    expect(template).toMatchObject({ schoolId: f.school.id, name: "Absence note" });

    const list = await api(getTemplates, { cookie, query: { category: "ATTENDANCE" } });
    expect(list.status).toBe(200);
    expect((list.data as Array<{ id: string; variables: string[] }>)[0]).toMatchObject({ id: template.id, variables: ["studentName", "className", "date", "teacherName", "unknown"] });
    expect(await listTemplates(f.admin, { category: "OTHER" })).toEqual([]);

    const rendered = await api(renderRoute, { cookie, params: { id: template.id }, query: { studentId: f.students[0].student.id } });
    expect(rendered.status).toBe(200);
    expect(rendered.data).toEqual({
      templateId: template.id,
      studentId: f.students[0].student.id,
      vars: { studentName: "Kid1 Tester", className: "10A", teacherName: f.teacher.user.name, date: formatDate(new Date()) },
      subject: "Kid1 Tester absent",
      body: `Dear parent, Kid1 Tester (10A) was absent on ${formatDate(new Date())}. Regards, ${f.teacher.user.name}. `,
    });
    // a non-teacher renders with the homeroom teacher's name; unrelated teachers cannot render for the student
    expect((await renderTemplateForStudent(f.admin, template.id, f.students[0].student.id)).vars.teacherName).toBe(f.teacher.user.name);
    await expect(renderTemplateForStudent(f.teacher2.auth, template.id, f.students[0].student.id)).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect((await api(renderRoute, { cookie, params: { id: template.id } })).status).toBe(422);

    const patched = await api(patchTemplate, { cookie: await signIn(f.adminUser.email), method: "PATCH", params: { id: template.id }, body: { subject: "Absence: {{studentName}}" } });
    expect(patched.status).toBe(200);
    expect(patched.data).toMatchObject({ subject: "Absence: {{studentName}}" });
    expect((await renderTemplateForStudent(f.teacher.auth, template.id, f.students[1].student.id)).subject).toBe("Absence: Kid2 Tester");

    // other schools cannot touch it
    const other = await createOtherSchool();
    await expect(updateTemplate(other.admin, template.id, { name: "x" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(deleteTemplate(other.admin, template.id)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(renderTemplateForStudent(other.admin, template.id, other.student.student.id)).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(await listTemplates(other.admin)).toEqual([]);

    // students and parents cannot manage or use templates
    const student = f.students[0].auth!;
    await expect(listTemplates(student)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(createTemplate(student, { name: "x", category: "GENERAL", subject: "s", body: "b" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(updateTemplate(student, template.id, { name: "x" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(deleteTemplate(student, template.id)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(renderTemplateForStudent(f.guardian.auth, template.id, f.students[0].student.id)).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect((await api(postTemplate, { cookie: await signIn(f.students[0].user!.email), body: { name: "x", subject: "s", body: "b" } })).status).toBe(403);
    expect((await api(getTemplates, { cookie: await signIn(f.guardian.user.email) })).status).toBe(403);

    const deleted = await api(deleteTemplateRoute, { cookie, method: "DELETE", params: { id: template.id } });
    expect(deleted.status).toBe(204);
    expect(await prisma.messageTemplate.count()).toBe(0);
    await expect(deleteTemplate(f.teacher.auth, template.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(await prisma.auditLog.count({ where: { entityType: "MessageTemplate" } })).toBe(3);
  });
});
