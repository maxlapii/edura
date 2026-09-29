import { describe, expect, it } from "vitest";
import { ZodError } from "zod";
import { createOtherSchool, createSchoolFixture, prisma } from "../helpers";
import { createRule, createRuleSchema, deleteRule, getRule, listRules, listRuns, resetDefaults, testRule, toggleRule, updateRule, workflowCatalog } from "@/modules/workflows";
import { DEFAULT_WORKFLOW_RULES, dispatch } from "@/lib/workflows";

const valid = (o: Record<string, unknown> = {}) =>
  createRuleSchema.parse({
    name: "Notify on events",
    trigger: "EVENT_CREATED",
    conditions: { all: [{ field: "type", op: "eq", value: "TRIP" }] },
    actions: [{ type: "SEND_NOTIFICATION", params: { to: "payload.userIds", title: "Trip: {{title}}", email: false } }],
    ...o,
  });

describe("workflow administration", () => {
  it("createRule stores validated conditions/actions and rejects invalid ones", async () => {
    const f = await createSchoolFixture();
    const rule = await createRule(f.admin, valid());
    expect(rule).toMatchObject({ schoolId: f.school.id, name: "Notify on events", trigger: "EVENT_CREATED", isActive: true, _count: { runs: 0 } });
    expect(rule.conditions).toEqual({ all: [{ field: "type", op: "eq", value: "TRIP" }] });
    expect(rule.actions).toEqual([{ type: "SEND_NOTIFICATION", params: { to: "payload.userIds", title: "Trip: {{title}}", email: false } }]);

    // schema-level validation
    expect(() => valid({ actions: [] })).toThrow(ZodError);
    expect(() => valid({ actions: [{ type: "NOPE" }] })).toThrow(ZodError);
    expect(() => valid({ trigger: "SOMETHING" })).toThrow(ZodError);
    expect(() => valid({ conditions: { all: [{ field: "x", op: "matches" }] } })).toThrow(ZodError);
    expect(() => valid({ conditions: { all: [{ op: "eq", value: 1 }] } })).toThrow(ZodError);
    // service-level validation (bypassing the schema)
    await expect(createRule(f.admin, { ...valid(), conditions: { all: [{ field: "x", op: "bogus" }] } } as never)).rejects.toBeInstanceOf(ZodError);
    await expect(createRule(f.admin, { ...valid(), actions: [{ type: "EXPLODE", params: {} }] } as never)).rejects.toBeInstanceOf(ZodError);
    await expect(updateRule(f.admin, rule.id, { actions: [{ type: "EXPLODE" }] } as never)).rejects.toBeInstanceOf(ZodError);
    expect(await prisma.workflowRule.count({ where: { schoolId: f.school.id, name: "Notify on events" } })).toBe(1);
    // teachers may not manage rules
    await expect(createRule(f.teacher.auth, valid())).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(listRules(f.teacher.auth)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(getRule(f.teacher.auth, rule.id)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(listRuns(f.teacher.auth)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(resetDefaults(f.teacher.auth)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("listRules is scoped to the school and supports trigger/isActive filters; other schools cannot touch a rule", async () => {
    const f = await createSchoolFixture();
    const other = await createOtherSchool();
    const rule = await createRule(f.admin, valid({ isActive: false }));
    const all = await listRules(f.admin);
    expect(all).toHaveLength(DEFAULT_WORKFLOW_RULES.length + 1);
    expect(all.every((r) => r.schoolId === f.school.id)).toBe(true);
    expect((await listRules(f.admin, { isActive: "false" })).map((r) => r.id)).toEqual([rule.id]);
    expect((await listRules(f.admin, { trigger: "EVENT_CREATED" })).map((r) => r.name).sort()).toEqual(["Notify administrators of new events", "Notify on events"]);
    expect((await listRules(other.admin)).some((r) => r.id === rule.id)).toBe(false);
    await expect(getRule(other.admin, rule.id)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(toggleRule(other.admin, rule.id, true)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(deleteRule(other.admin, rule.id)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(getRule(f.admin, "missing")).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("toggleRule switches a rule off and on, which controls whether it fires", async () => {
    const f = await createSchoolFixture();
    const rule = await createRule(f.admin, valid({ conditions: {} }));
    expect((await toggleRule(f.admin, rule.id, false)).isActive).toBe(false);
    await dispatch("EVENT_CREATED", f.school.id, { title: "x", userIds: [f.teacher.user.id] });
    expect(await prisma.workflowRun.count({ where: { ruleId: rule.id } })).toBe(0);
    expect((await toggleRule(f.admin, rule.id, true)).isActive).toBe(true);
    await dispatch("EVENT_CREATED", f.school.id, { title: "y", userIds: [f.teacher.user.id] });
    expect(await prisma.workflowRun.count({ where: { ruleId: rule.id } })).toBe(1);
    expect(await prisma.notification.count({ where: { userId: f.teacher.user.id, title: "Trip: y" } })).toBe(1);
    expect((await getRule(f.admin, rule.id)).recentRuns).toHaveLength(1);
  });

  it("resetDefaults re-installs deleted defaults without touching existing rules", async () => {
    const f = await createSchoolFixture();
    const leaveRule = await prisma.workflowRule.findFirstOrThrow({ where: { schoolId: f.school.id, name: "Notify administrators of leave requests" } });
    const certRule = await prisma.workflowRule.findFirstOrThrow({ where: { schoolId: f.school.id, name: "Remind teachers of expiring certifications" } });
    await deleteRule(f.admin, leaveRule.id);
    await deleteRule(f.admin, certRule.id);
    const edited = await updateRule(f.admin, (await prisma.workflowRule.findFirstOrThrow({ where: { schoolId: f.school.id, name: "Overdue task reminder" } })).id, { isActive: false, description: "customised" });
    expect(await prisma.workflowRule.count({ where: { schoolId: f.school.id } })).toBe(DEFAULT_WORKFLOW_RULES.length - 2);

    const result = await resetDefaults(f.admin);
    expect(result.installed.sort()).toEqual(["Notify administrators of leave requests", "Remind teachers of expiring certifications"]);
    expect(result.skipped).toBe(DEFAULT_WORKFLOW_RULES.length - 2);
    expect(await prisma.workflowRule.count({ where: { schoolId: f.school.id } })).toBe(DEFAULT_WORKFLOW_RULES.length);
    const reinstalled = await prisma.workflowRule.findFirstOrThrow({ where: { schoolId: f.school.id, name: "Notify administrators of leave requests" } });
    expect(reinstalled.isActive).toBe(true);
    expect(reinstalled.actions).toEqual(DEFAULT_WORKFLOW_RULES.find((r) => r.name === reinstalled.name)!.actions);
    expect(await prisma.workflowRule.findUniqueOrThrow({ where: { id: edited.id } })).toMatchObject({ isActive: false, description: "customised" });
    expect(await resetDefaults(f.admin)).toEqual({ installed: [], skipped: DEFAULT_WORKFLOW_RULES.length });
  });

  it("testRule previews interpolated actions and recipients without executing anything", async () => {
    const f = await createSchoolFixture();
    const rule = await createRule(f.admin, valid({ actions: [{ type: "SEND_NOTIFICATION", params: { to: ["payload.userIds", "admins"], title: "Trip: {{title}}", body: "Leaves at {{when}}", link: "/events/{{id}}", email: true } }, { type: "CREATE_TASK", params: { assignee: "payload.ownerId", title: "Plan {{title}}", dueInDays: 5, priority: "HIGH" } }] }));
    const hit = await testRule(f.admin, rule.id, { payload: { type: "TRIP", title: "Zoo", when: "9am", id: "e1", userIds: [f.teacher.user.id], ownerId: f.teacher2.user.id } });
    expect(hit).toMatchObject({ ruleId: rule.id, ruleName: "Notify on events", trigger: "EVENT_CREATED", isActive: true, matched: true });
    expect(hit.conditions).toEqual([{ group: "all", field: "type", op: "eq", value: "TRIP", passed: true }]);
    expect(hit.actions[0]).toMatchObject({ type: "SEND_NOTIFICATION", wouldExecute: true, recipients: { userIds: [f.teacher.user.id], wantsAdmins: true }, preview: { title: "Trip: Zoo", body: "Leaves at 9am", link: "/events/e1", email: true } });
    expect(hit.actions[1]).toMatchObject({ type: "CREATE_TASK", wouldExecute: true, recipients: { userIds: [f.teacher2.user.id], wantsAdmins: false }, preview: { title: "Plan Zoo", dueInDays: 5, priority: "HIGH" } });

    const miss = await testRule(f.admin, rule.id, { payload: { type: "SPORTS", title: "Run" } });
    expect(miss.matched).toBe(false);
    expect(miss.conditions[0].passed).toBe(false);
    expect(miss.actions.every((a) => !a.wouldExecute)).toBe(true);
    expect(miss.actions[0].preview.title).toBe("Trip: Run");

    // no side effects at all
    expect(await prisma.notification.count()).toBe(0);
    expect(await prisma.task.count()).toBe(0);
    expect(await prisma.workflowRun.count()).toBe(0);
    await expect(testRule(f.teacher.auth, rule.id, { payload: {} })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("listRuns returns the school's runs newest first with filters", async () => {
    const f = await createSchoolFixture();
    const other = await createOtherSchool();
    const rule = await createRule(f.admin, valid());
    await dispatch("EVENT_CREATED", f.school.id, { type: "SPORTS" }); // custom rule SKIPPED, default rule SUCCESS
    await dispatch("EVENT_CREATED", f.school.id, { type: "TRIP", title: "Zoo", userIds: [f.teacher.user.id] });
    await dispatch("EVENT_CREATED", other.school.id, { title: "elsewhere" });
    const runs = await listRuns(f.admin);
    expect(runs).toHaveLength(4);
    expect(runs.every((r) => r.schoolId === f.school.id)).toBe(true);
    expect(runs[0].createdAt.getTime()).toBeGreaterThanOrEqual(runs[3].createdAt.getTime());
    expect((await listRuns(f.admin, { ruleId: rule.id })).map((r) => r.status).sort()).toEqual(["SKIPPED", "SUCCESS"]);
    expect((await listRuns(f.admin, { status: "SKIPPED" })).map((r) => r.rule?.name)).toEqual(["Notify on events"]);
    expect((await listRuns(f.admin, { trigger: "LEAVE_REQUESTED" }))).toEqual([]);
    expect((await listRuns(other.admin)).map((r) => r.payload)).toEqual([{ title: "elsewhere" }]);
    const catalog = workflowCatalog();
    expect(catalog.triggers.map((t) => t.value)).toContain("EVENT_CREATED");
    expect(catalog.actions.map((a) => a.type)).toEqual(["SEND_NOTIFICATION", "CREATE_ALERT", "SEND_EMAIL", "CREATE_TASK", "REQUEST_APPROVAL"]);
  });
});
