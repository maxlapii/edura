import { describe, expect, it } from "vitest";
import { emailOutbox } from "../../setup/integration";
import { createOtherSchool, createSchoolFixture, prisma } from "../helpers";
import { dispatch } from "@/lib/workflows/engine";

const DAY = 86_400_000;

/** Fixture with the default rules switched off so only the custom rules under test fire. */
async function isolated() {
  const f = await createSchoolFixture();
  await prisma.workflowRule.updateMany({ where: { schoolId: f.school.id }, data: { isActive: false } });
  return f;
}

function rule(schoolId: string, actions: unknown, extra: { conditions?: unknown; isActive?: boolean; name?: string } = {}) {
  return prisma.workflowRule.create({
    data: { schoolId, name: extra.name ?? "custom", trigger: "EVENT_CREATED", conditions: (extra.conditions ?? {}) as object, actions: actions as object[], isActive: extra.isActive ?? true },
  });
}

describe("workflow engine", () => {
  it("SEND_NOTIFICATION resolves payload recipients and interpolates templates", async () => {
    const f = await isolated();
    const r = await rule(f.school.id, [{ type: "SEND_NOTIFICATION", params: { to: "payload.userIds", type: "EVENT_CREATED", title: "New: {{title}}", body: "{{type}} on {{startsAt}} by {{organizer.name}}", link: "/events/{{eventId}}" } }]);
    const results = await dispatch("EVENT_CREATED", f.school.id, { eventId: "e1", title: "Sports day", type: "SPORTS", startsAt: new Date("2026-11-05T09:00:00Z"), organizer: { name: "Ms Organiser" }, userIds: [f.teacher.user.id, f.teacher2.user.id, f.teacher.user.id] });
    expect(results).toEqual([{ ruleId: r.id, ruleName: "custom", status: "SUCCESS", actions: [{ type: "SEND_NOTIFICATION", detail: "2 recipient(s)" }] }]);
    const notes = await prisma.notification.findMany({ where: { type: "EVENT_CREATED" }, orderBy: { createdAt: "asc" } });
    expect(new Set(notes.map((n) => n.userId))).toEqual(new Set([f.teacher.user.id, f.teacher2.user.id]));
    expect(notes[0]).toMatchObject({ title: "New: Sports day", body: "SPORTS on 2026-11-05 by Ms Organiser", link: "/events/e1", schoolId: f.school.id, emailSentAt: null });
    const run = await prisma.workflowRun.findFirstOrThrow({ where: { ruleId: r.id } });
    expect(run).toMatchObject({ trigger: "EVENT_CREATED", status: "SUCCESS", error: null, result: { actions: [{ type: "SEND_NOTIFICATION", detail: "2 recipient(s)" }] } });
    expect(run.payload).toMatchObject({ eventId: "e1", title: "Sports day" });
    // "user:<id>" literal recipients and email flag
    await rule(f.school.id, [{ type: "SEND_NOTIFICATION", params: { to: `user:${f.adminUser.id}`, title: "Direct", email: true } }]);
    await dispatch("EVENT_CREATED", f.school.id, {});
    const direct = await prisma.notification.findFirstOrThrow({ where: { userId: f.adminUser.id, title: "Direct" } });
    expect(direct.type).toBe("GENERIC");
    expect(direct.emailSentAt).not.toBeNull();
  });

  it("CREATE_TASK creates workflow tasks per assignee with dueInDays and priority", async () => {
    const f = await isolated();
    await rule(f.school.id, [{ type: "CREATE_TASK", params: { assignee: "payload.userIds", title: "Prepare {{title}}", description: "For {{title}}", dueInDays: 3, priority: "HIGH" } }]);
    const before = Date.now();
    const [res] = await dispatch("EVENT_CREATED", f.school.id, { sourceId: "evt-1", title: "Open day", userIds: [f.teacher.user.id, f.teacher2.user.id] });
    expect(res.actions).toEqual([{ type: "CREATE_TASK", detail: "2 task(s)" }]);
    const tasks = await prisma.task.findMany({ orderBy: { createdAt: "asc" } });
    expect(tasks).toHaveLength(2);
    expect(new Set(tasks.map((t) => t.assigneeUserId))).toEqual(new Set([f.teacher.user.id, f.teacher2.user.id]));
    expect(tasks[0]).toMatchObject({ title: "Prepare Open day", description: "For Open day", priority: "HIGH", status: "TODO", source: "WORKFLOW", sourceId: "evt-1", createdByUserId: null, schoolId: f.school.id });
    const due = tasks[0].dueDate!.getTime();
    expect(due).toBeGreaterThanOrEqual(before + 3 * DAY - 5_000);
    expect(due).toBeLessThanOrEqual(Date.now() + 3 * DAY + 5_000);
    // unknown priority falls back to MEDIUM; no dueInDays → no due date
    await prisma.task.deleteMany();
    await prisma.workflowRule.deleteMany({ where: { name: "custom" } });
    await rule(f.school.id, [{ type: "CREATE_TASK", params: { assignee: "admins", title: "Check", priority: "EXTREME" } }]);
    await dispatch("EVENT_CREATED", f.school.id, {});
    const adminTasks = await prisma.task.findMany();
    expect(adminTasks).toHaveLength(2);
    expect(adminTasks.every((t) => t.priority === "MEDIUM" && t.dueDate === null && t.sourceId === null)).toBe(true);
  });

  it("CREATE_ALERT to admins reaches every administrator of the school only", async () => {
    const f = await isolated();
    const other = await createOtherSchool();
    await rule(f.school.id, [{ type: "CREATE_ALERT", params: { to: ["admins", "payload.extra"], title: "Alert {{n}}" } }]);
    const [res] = await dispatch("EVENT_CREATED", f.school.id, { n: 7, extra: f.teacher.user.id });
    expect(res.actions).toEqual([{ type: "CREATE_ALERT", detail: "3 recipient(s)" }]);
    const alerts = await prisma.notification.findMany({ where: { title: "Alert 7" } });
    expect(new Set(alerts.map((a) => a.userId))).toEqual(new Set([f.adminUser.id, f.principal.id, f.teacher.user.id]));
    expect(alerts.every((a) => a.type === "ALERT")).toBe(true);
    expect(await prisma.notification.count({ where: { userId: other.admin.id } })).toBe(0);
  });

  it("SEND_EMAIL sends only email (no notification rows)", async () => {
    const f = await isolated();
    emailOutbox.sent.length = 0;
    await rule(f.school.id, [{ type: "SEND_EMAIL", params: { to: "payload.userIds", subject: "About {{title}}", body: "Hello {{name}}" } }]);
    const [res] = await dispatch("EVENT_CREATED", f.school.id, { title: "Trip", name: "Team", userIds: [f.teacher.user.id, f.teacher2.user.id] });
    expect(res.actions).toEqual([{ type: "SEND_EMAIL", detail: "2 email(s)" }]);
    expect(emailOutbox.sent).toHaveLength(2);
    expect(new Set(emailOutbox.sent.map((m) => m.to))).toEqual(new Set([f.teacher.user.email, f.teacher2.user.email]));
    expect(emailOutbox.sent[0]).toMatchObject({ subject: "About Trip", text: "Hello Team" });
    expect(await prisma.notification.count()).toBe(0);
  });

  it("REQUEST_APPROVAL opens a PENDING approval for the requester", async () => {
    const f = await isolated();
    await rule(f.school.id, [{ type: "REQUEST_APPROVAL", params: { approvalType: "TRIP", entityType: "Event", title: "Trip approval: {{title}}" } }]);
    const [res] = await dispatch("EVENT_CREATED", f.school.id, { sourceId: "evt-9", title: "Museum", requesterUserId: f.teacher.user.id });
    expect(res.actions).toEqual([{ type: "REQUEST_APPROVAL", detail: "approval created" }]);
    const approval = await prisma.approval.findFirstOrThrow();
    expect(approval).toMatchObject({ status: "PENDING", type: "TRIP", entityType: "Event", entityId: "evt-9", title: "Trip approval: Museum", requesterUserId: f.teacher.user.id, schoolId: f.school.id });
    // custom requester expression; no requester → skipped
    await prisma.workflowRule.deleteMany();
    await rule(f.school.id, [{ type: "REQUEST_APPROVAL", params: { requester: "payload.owner.id", title: "X" } }]);
    expect((await dispatch("EVENT_CREATED", f.school.id, { owner: { id: f.teacher2.user.id } }))[0].actions[0].detail).toBe("approval created");
    expect((await dispatch("EVENT_CREATED", f.school.id, {}))[0].actions[0].detail).toBe("skipped: no requester");
    expect(await prisma.approval.count()).toBe(2);
  });

  it("rules whose conditions do not match are SKIPPED without side effects", async () => {
    const f = await isolated();
    const r = await rule(f.school.id, [{ type: "CREATE_ALERT", params: { title: "Big event" } }], { conditions: { all: [{ field: "type", op: "eq", value: "TRIP" }, { field: "size", op: "gte", value: 100 }], any: [{ field: "tags", op: "contains", value: "urgent" }, { field: "vip", op: "truthy" }] } });
    const skipped = await dispatch("EVENT_CREATED", f.school.id, { type: "TRIP", size: 50, vip: true });
    expect(skipped).toEqual([{ ruleId: r.id, ruleName: "custom", status: "SKIPPED", actions: [] }]);
    expect(await prisma.notification.count()).toBe(0);
    expect((await dispatch("EVENT_CREATED", f.school.id, { type: "TRIP", size: 120, tags: [] }))[0].status).toBe("SKIPPED");
    expect((await dispatch("EVENT_CREATED", f.school.id, { type: "TRIP", size: 120, tags: ["urgent"] }))[0].status).toBe("SUCCESS");
    expect(await prisma.notification.count()).toBe(2);
    const runs = await prisma.workflowRun.findMany({ where: { ruleId: r.id }, orderBy: { createdAt: "asc" } });
    expect(runs.map((x) => x.status)).toEqual(["SKIPPED", "SKIPPED", "SUCCESS"]);
    expect(runs[0].result).toEqual({ actions: [] });
    // a trigger with no rules at all returns nothing
    expect(await dispatch("MAINTENANCE_CREATED", f.school.id, {})).toEqual([]);
  });

  it("a rule with malformed actions FAILS and is recorded, while other rules still execute", async () => {
    const f = await isolated();
    const broken = await rule(f.school.id, [{ type: "EXPLODE", params: {} }], { name: "broken" });
    const badConditions = await rule(f.school.id, [{ type: "CREATE_ALERT", params: { title: "never" } }], { name: "bad-conditions", conditions: { all: [{ field: "x", op: "matches" }] } });
    const good = await rule(f.school.id, [{ type: "CREATE_ALERT", params: { title: "still works" } }], { name: "good" });
    const results = await dispatch("EVENT_CREATED", f.school.id, {});
    expect(results).toHaveLength(3);
    const byId = (id: string) => results.find((r) => r.ruleId === id)!;
    expect(byId(broken.id).status).toBe("FAILED");
    expect(byId(broken.id).error).toBeTruthy();
    expect(byId(badConditions.id).status).toBe("FAILED");
    expect(byId(good.id)).toMatchObject({ status: "SUCCESS", actions: [{ type: "CREATE_ALERT", detail: "2 recipient(s)" }] });
    const failedRun = await prisma.workflowRun.findFirstOrThrow({ where: { ruleId: broken.id } });
    expect(failedRun.status).toBe("FAILED");
    expect(failedRun.error).toMatch(/Invalid option|invalid_value/);
    expect(failedRun.result).toEqual({ actions: [] });
    expect(await prisma.notification.count({ where: { title: "still works" } })).toBe(2);
    expect(await prisma.notification.count({ where: { title: "never" } })).toBe(0);
    expect(await prisma.workflowRun.count({ where: { trigger: "EVENT_CREATED" } })).toBe(3);
  });

  it("inactive rules are ignored and produce no run", async () => {
    const f = await isolated();
    const off = await rule(f.school.id, [{ type: "CREATE_ALERT", params: { title: "off" } }], { isActive: false });
    expect(await dispatch("EVENT_CREATED", f.school.id, {})).toEqual([]);
    expect(await prisma.workflowRun.count({ where: { ruleId: off.id } })).toBe(0);
    expect(await prisma.notification.count()).toBe(0);
    // the default rules were deactivated by the fixture, so nothing fired for them either
    expect(await prisma.workflowRun.count()).toBe(0);
    await prisma.workflowRule.update({ where: { id: off.id }, data: { isActive: true } });
    expect((await dispatch("EVENT_CREATED", f.school.id, {}))[0].status).toBe("SUCCESS");
  });

  it("rules from another school never fire", async () => {
    const f = await isolated();
    const other = await createOtherSchool();
    await prisma.workflowRule.updateMany({ where: { schoolId: other.school.id }, data: { isActive: false } });
    const foreign = await rule(other.school.id, [{ type: "CREATE_ALERT", params: { title: "foreign" } }]);
    const mine = await rule(f.school.id, [{ type: "CREATE_ALERT", params: { title: "mine" } }]);
    const results = await dispatch("EVENT_CREATED", f.school.id, {});
    expect(results.map((r) => r.ruleId)).toEqual([mine.id]);
    expect(await prisma.workflowRun.count({ where: { ruleId: foreign.id } })).toBe(0);
    expect(await prisma.workflowRun.count({ where: { schoolId: other.school.id } })).toBe(0);
    expect(await prisma.notification.count({ where: { title: "foreign" } })).toBe(0);
    expect(await prisma.notification.count({ where: { userId: other.admin.id } })).toBe(0);
    const mineNotes = await prisma.notification.findMany({ where: { title: "mine" } });
    expect(new Set(mineNotes.map((n) => n.userId))).toEqual(new Set([f.adminUser.id, f.principal.id]));
    // and dispatching for the other school only runs its rule
    expect((await dispatch("EVENT_CREATED", other.school.id, {})).map((r) => r.ruleId)).toEqual([foreign.id]);
  });
});
