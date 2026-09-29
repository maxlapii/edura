import { describe, expect, it } from "vitest";
import { asUser, createSchoolFixture, createTeacher, prisma } from "../helpers";
import { createTask, createTaskSchema, deleteTask, getTask, listTasks, processOverdueTasks, updateTask } from "@/modules/tasks";

const DAY = 86_400_000;
const inDays = (n: number) => new Date(Date.now() + n * DAY);
const task = (o: Record<string, unknown> = {}) => createTaskSchema.parse({ title: "Grade essays", ...o });

describe("tasks", () => {
  it("a teacher creates a personal task (no notification)", async () => {
    const f = await createSchoolFixture();
    const t = await createTask(f.teacher.auth, task({ dueDate: inDays(2), priority: "HIGH" }));
    expect(t).toMatchObject({ assigneeUserId: f.teacher.user.id, createdByUserId: f.teacher.user.id, status: "TODO", source: "SELF", priority: "HIGH", schoolId: f.school.id });
    expect(await prisma.notification.count({ where: { type: "TASK_ASSIGNED" } })).toBe(0);
    expect(await getTask(f.teacher.auth, t.id)).toMatchObject({ id: t.id });
    // students have no tasks:manage
    await expect(createTask(f.students[0].auth!, task())).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("an admin assigns a task to a teacher, who is notified; a teacher cannot assign to others", async () => {
    const f = await createSchoolFixture();
    const t = await createTask(f.admin, task({ title: "Submit report comments", assigneeUserId: f.teacher.user.id, dueDate: new Date("2026-10-10T00:00:00Z") }));
    expect(t).toMatchObject({ assigneeUserId: f.teacher.user.id, createdByUserId: f.adminUser.id, source: "ADMIN" });
    const note = await prisma.notification.findFirst({ where: { userId: f.teacher.user.id, type: "TASK_ASSIGNED" } });
    expect(note).toMatchObject({ title: "New task: Submit report comments", body: "Due 2026-10-10", link: "/tasks" });

    await expect(createTask(f.teacher.auth, task({ assigneeUserId: f.teacher2.user.id }))).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(await prisma.task.count({ where: { assigneeUserId: f.teacher2.user.id } })).toBe(0);
    // assignee must be in the same school
    const other = await prisma.user.findFirstOrThrow({ where: { NOT: { schoolId: f.school.id } }, select: { id: true } }).catch(() => null);
    if (other) await expect(createTask(f.admin, task({ assigneeUserId: other.id }))).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    await expect(createTask(f.admin, task({ assigneeUserId: "nope" }))).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("a department head can only assign within their department", async () => {
    const f = await createSchoolFixture();
    await prisma.department.update({ where: { id: f.department.id }, data: { headTeacherId: f.teacher.teacher.id } });
    await prisma.user.update({ where: { id: f.teacher.user.id }, data: { role: "DEPARTMENT_HEAD" } });
    const head = await asUser(f.teacher.user.id);
    expect(head.departmentId).toBe(f.department.id);
    const outsider = await createTeacher(f.school.id, { departmentId: null, name: "Outside Dept" });

    const ok = await createTask(head, task({ assigneeUserId: f.teacher2.user.id }));
    expect(ok.assigneeUserId).toBe(f.teacher2.user.id);
    await expect(createTask(head, task({ assigneeUserId: outsider.user.id }))).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(createTask(head, task({ assigneeUserId: f.adminUser.id }))).rejects.toMatchObject({ code: "FORBIDDEN" });
    // scope=all for a head lists only department teachers' tasks
    await createTask(f.admin, task({ assigneeUserId: outsider.user.id }));
    const all = await listTasks(head, { scope: "all" });
    expect(all.map((t) => t.assigneeUserId)).toEqual([f.teacher2.user.id]);
  });

  it("listTasks scopes: mine vs all, OPEN and overdue filters", async () => {
    const f = await createSchoolFixture();
    const mine = await createTask(f.teacher.auth, task({ title: "mine open", dueDate: inDays(3) }));
    const overdue = await createTask(f.teacher.auth, task({ title: "mine overdue", dueDate: inDays(-1) }));
    const done = await createTask(f.teacher.auth, task({ title: "mine done", dueDate: inDays(-5) }));
    await updateTask(f.teacher.auth, done.id, { status: "DONE" });
    const theirs = await createTask(f.teacher2.auth, task({ title: "teacher2 own" }));
    const assignedByMe = await createTask(f.admin, task({ title: "admin -> teacher2", assigneeUserId: f.teacher2.user.id }));

    const ids = (rows: Array<{ id: string }>) => new Set(rows.map((r) => r.id));
    expect(ids(await listTasks(f.teacher.auth))).toEqual(ids([mine, overdue, done]));
    // teachers lack tasks:assign, so scope=all falls back to their own tasks
    expect(ids(await listTasks(f.teacher.auth, { scope: "all" }))).toEqual(ids([mine, overdue, done]));
    expect(ids(await listTasks(f.teacher.auth, { status: "OPEN" }))).toEqual(ids([mine, overdue]));
    expect(ids(await listTasks(f.teacher.auth, { status: "DONE" }))).toEqual(ids([done]));
    expect(ids(await listTasks(f.teacher.auth, { overdue: true }))).toEqual(ids([overdue]));
    // admin: mine = created by me, all = everything in the school
    expect(ids(await listTasks(f.admin))).toEqual(ids([assignedByMe]));
    expect(ids(await listTasks(f.admin, { scope: "all" }))).toEqual(ids([mine, overdue, done, theirs, assignedByMe]));
    expect(ids(await listTasks(f.admin, { scope: "all", assigneeUserId: f.teacher2.user.id }))).toEqual(ids([theirs, assignedByMe]));
    // other users cannot open a task they are not part of
    await expect(getTask(f.teacher2.auth, mine.id)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("updateTask DONE sets completedAt (and clears it when reopened)", async () => {
    const f = await createSchoolFixture();
    const t = await createTask(f.admin, task({ assigneeUserId: f.teacher.user.id }));
    const done = await updateTask(f.teacher.auth, t.id, { status: "DONE" });
    expect(done.status).toBe("DONE");
    expect(done.completedAt).toBeInstanceOf(Date);
    const reopened = await updateTask(f.teacher.auth, t.id, { status: "IN_PROGRESS" });
    expect(reopened.completedAt).toBeNull();
    // assignee cannot reassign (needs tasks:assign); admin can, and the new assignee is notified
    await expect(updateTask(f.teacher.auth, t.id, { assigneeUserId: f.teacher2.user.id })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await updateTask(f.admin, t.id, { assigneeUserId: f.teacher2.user.id });
    expect(await prisma.notification.count({ where: { userId: f.teacher2.user.id, type: "TASK_ASSIGNED" } })).toBe(1);
    await expect(updateTask(f.students[0].auth!, t.id, { status: "DONE" })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("only the creator or an admin can delete a task", async () => {
    const f = await createSchoolFixture();
    const t = await createTask(f.admin, task({ assigneeUserId: f.teacher.user.id }));
    await expect(deleteTask(f.teacher.auth, t.id)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(deleteTask(f.teacher2.auth, t.id)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await deleteTask(f.admin, t.id);
    expect(await prisma.task.count({ where: { id: t.id } })).toBe(0);
    const own = await createTask(f.teacher.auth, task());
    await deleteTask(f.teacher.auth, own.id);
    expect(await prisma.task.count()).toBe(0);
  });

  it("processOverdueTasks emits TASK_OVERDUE once per task per day and the default rule notifies the assignee", async () => {
    const f = await createSchoolFixture();
    const t = await createTask(f.admin, task({ title: "Late thing", assigneeUserId: f.teacher.user.id, dueDate: inDays(-1) }));
    await createTask(f.admin, task({ title: "Not due", assigneeUserId: f.teacher.user.id, dueDate: inDays(1) }));
    expect(await processOverdueTasks(f.school.id)).toEqual({ tasks: 1, emitted: 1 });
    expect(await processOverdueTasks(f.school.id)).toEqual({ tasks: 1, emitted: 0 });

    const reminderRule = await prisma.workflowRule.findFirstOrThrow({ where: { schoolId: f.school.id, name: "Overdue task reminder" } });
    const escalationRule = await prisma.workflowRule.findFirstOrThrow({ where: { schoolId: f.school.id, name: "Escalate long-overdue tasks" } });
    expect(await prisma.workflowRun.count({ where: { ruleId: reminderRule.id } })).toBe(1);
    const runs = await prisma.workflowRun.findMany({ where: { trigger: "TASK_OVERDUE" } });
    expect(runs).toHaveLength(2); // one row per rule, once
    expect(runs.find((r) => r.ruleId === reminderRule.id)?.status).toBe("SUCCESS");
    expect(runs.find((r) => r.ruleId === escalationRule.id)?.status).toBe("SKIPPED"); // daysOverdue = 1 < 3
    expect(runs[0].payload).toMatchObject({ taskId: t.id, taskTitle: "Late thing", daysOverdue: 1, assigneeUserId: f.teacher.user.id });

    const notes = await prisma.notification.findMany({ where: { type: "TASK_OVERDUE" } });
    expect(notes).toHaveLength(1);
    expect(notes[0]).toMatchObject({ userId: f.teacher.user.id, title: "Overdue task: Late thing", link: "/tasks" });
  });

  it("tasks overdue for 3+ days are escalated to administrators", async () => {
    const f = await createSchoolFixture();
    await createTask(f.admin, task({ title: "Very late", assigneeUserId: f.teacher.user.id, dueDate: inDays(-5) }));
    expect(await processOverdueTasks(f.school.id)).toEqual({ tasks: 1, emitted: 1 });
    const alerts = await prisma.notification.findMany({ where: { type: "TASK_OVERDUE", title: { startsWith: "Escalation:" } } });
    expect(new Set(alerts.map((a) => a.userId))).toEqual(new Set([f.adminUser.id, f.principal.id]));
    expect(alerts[0].title).toBe("Escalation: Very late (5 days overdue)");
    expect(alerts[0].body).toBe(`Assigned to ${f.teacher.user.name}.`);
    // the assignee still gets the plain reminder
    expect(await prisma.notification.count({ where: { userId: f.teacher.user.id, type: "TASK_OVERDUE" } })).toBe(1);
    expect((await prisma.workflowRun.findMany({ where: { trigger: "TASK_OVERDUE" } })).every((r) => r.status === "SUCCESS")).toBe(true);
  });
});
