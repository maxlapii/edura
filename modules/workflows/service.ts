import { prisma } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";
import { WorkflowTrigger } from "@/generated/prisma/enums";
import type { AuthUser } from "@/lib/auth/types";
import { assertPermission, assertSchoolAccess, resolveSchoolId } from "@/lib/permissions";
import { AppError } from "@/lib/utils/errors";
import { audit } from "@/lib/audit";
import { DEFAULT_WORKFLOW_RULES } from "@/lib/workflows/defaults";
import { actionsSchema, conditionSchema, conditionsSchema, evaluateCondition, evaluateConditions, interpolate, resolveRecipients, type Payload } from "@/lib/workflows/rules";
import type { CreateRuleInput, ListRulesQuery, ListRunsQuery, TestRuleInput, UpdateRuleInput } from "./schema";

const ruleInclude = {
  _count: { select: { runs: true } },
} satisfies Prisma.WorkflowRuleInclude;

const runInclude = {
  rule: { select: { id: true, name: true } },
} satisfies Prisma.WorkflowRunInclude;

function toJson<T>(v: T): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(v)) as Prisma.InputJsonValue;
}

async function loadRule(user: AuthUser, id: string) {
  const rule = await prisma.workflowRule.findUnique({ where: { id }, include: ruleInclude });
  if (!rule) throw AppError.notFound("Workflow rule");
  assertSchoolAccess(user, rule.schoolId);
  return rule;
}

// ───────────── Catalog ─────────────

/** Human-readable descriptions of the trigger payloads (mirrors what the modules dispatch). */
const TRIGGER_DESCRIPTIONS: Record<WorkflowTrigger, string> = {
  ATTENDANCE_RECORDED: "A student's attendance was recorded (status, studentId, studentName, courseName, date, guardianUserIds).",
  ABSENCE_THRESHOLD_REACHED: "A student reached the repeated-absence threshold (studentId, studentName, absenceCount, windowDays, homeroomTeacherUserId).",
  GRADE_MISSING: "Grades are pending for an assignment near its deadline (teacherUserId, courseName, assignmentId, assignmentTitle, pendingCount).",
  ASSIGNMENT_OVERDUE: "A student did not submit an assignment by the due date (studentUserId, guardianUserIds, assignmentTitle, courseName, dueDate).",
  LEAVE_REQUESTED: "A teacher submitted a leave request (leaveRequestId, requesterUserId, requesterName, leaveType, startDate, endDate, days).",
  LEAVE_APPROVED: "A leave request was approved (leaveRequestId, requesterUserId, startDate, endDate, affectedLessons).",
  CERTIFICATION_EXPIRING: "A teacher certification expires soon (teacherId, teacherUserId, teacherName, certificationName, expiresAt).",
  TASK_OVERDUE: "A task passed its due date (taskId, taskTitle, dueDate, daysOverdue, assigneeUserId, assigneeName).",
  MEETING_COMPLETED: "Meeting minutes were published (meetingId, meetingTitle, participantUserIds).",
  EVENT_CREATED: "A school event was created (eventId, title, type, startsAt, organizerName).",
  MAINTENANCE_CREATED: "A maintenance request was reported (maintenanceRequestId, title, category, priority, roomName, reporterName, maintenanceStaffUserIds).",
};

export interface TriggerCatalogEntry {
  value: WorkflowTrigger;
  description: string;
  /** Default rules shipped for this trigger (name + description from lib/workflows/defaults). */
  defaults: Array<{ name: string; description: string }>;
}

export function listTriggers(): TriggerCatalogEntry[] {
  return Object.values(WorkflowTrigger).map((value) => ({
    value,
    description: TRIGGER_DESCRIPTIONS[value],
    defaults: DEFAULT_WORKFLOW_RULES.filter((r) => r.trigger === value).map((r) => ({ name: r.name, description: r.description })),
  }));
}

export function listActionTypes() {
  return [
    { type: "SEND_NOTIFICATION", params: ["to", "type", "title", "body", "link", "email"], description: "Creates an in-app notification (optionally emailed)." },
    { type: "CREATE_ALERT", params: ["to", "type", "title", "body", "link", "email"], description: "Creates an alert-style notification." },
    { type: "SEND_EMAIL", params: ["to", "subject", "body"], description: "Sends an email only." },
    { type: "CREATE_TASK", params: ["assignee", "title", "description", "dueInDays", "priority"], description: "Creates a task for each assignee." },
    { type: "REQUEST_APPROVAL", params: ["requester", "approvalType", "entityType", "title"], description: "Opens an approval request." },
  ] as const;
}

export function workflowCatalog() {
  return {
    triggers: listTriggers(),
    actions: listActionTypes(),
    operators: conditionSchema.shape.op.options,
    recipientSpecs: ["admins", "payload.<field>", "user:<id>"],
  };
}

// ───────────── Rules ─────────────

export async function listRules(user: AuthUser, query: ListRulesQuery = {}) {
  assertPermission(user, "workflows:manage");
  const schoolId = resolveSchoolId(user);
  return prisma.workflowRule.findMany({
    where: { schoolId, trigger: query.trigger, isActive: query.isActive === undefined ? undefined : query.isActive === "true" },
    include: ruleInclude,
    orderBy: [{ trigger: "asc" }, { name: "asc" }],
  });
}

export async function getRule(user: AuthUser, id: string) {
  assertPermission(user, "workflows:manage");
  const rule = await loadRule(user, id);
  const recentRuns = await prisma.workflowRun.findMany({ where: { ruleId: id }, orderBy: { createdAt: "desc" }, take: 20 });
  return { ...rule, recentRuns };
}

export async function createRule(user: AuthUser, input: CreateRuleInput) {
  assertPermission(user, "workflows:manage");
  const schoolId = resolveSchoolId(user);
  const rule = await prisma.workflowRule.create({
    data: {
      schoolId,
      name: input.name,
      description: input.description ?? null,
      trigger: input.trigger,
      conditions: toJson(conditionsSchema.parse(input.conditions)),
      actions: toJson(actionsSchema.parse(input.actions)),
      isActive: input.isActive,
    },
    include: ruleInclude,
  });
  await audit({ user, schoolId, action: "workflow_rule.create", entityType: "WorkflowRule", entityId: rule.id, after: rule });
  return rule;
}

export async function updateRule(user: AuthUser, id: string, input: UpdateRuleInput) {
  assertPermission(user, "workflows:manage");
  const before = await loadRule(user, id);
  const data: Prisma.WorkflowRuleUpdateInput = {
    name: input.name,
    description: input.description,
    trigger: input.trigger,
    isActive: input.isActive,
  };
  if (input.conditions !== undefined) data.conditions = toJson(conditionsSchema.parse(input.conditions));
  if (input.actions !== undefined) data.actions = toJson(actionsSchema.parse(input.actions));
  const rule = await prisma.workflowRule.update({ where: { id }, data, include: ruleInclude });
  await audit({ user, schoolId: before.schoolId, action: "workflow_rule.update", entityType: "WorkflowRule", entityId: id, before, after: rule });
  return rule;
}

export async function toggleRule(user: AuthUser, id: string, isActive: boolean) {
  return updateRule(user, id, { isActive });
}

export async function deleteRule(user: AuthUser, id: string) {
  assertPermission(user, "workflows:manage");
  const before = await loadRule(user, id);
  await prisma.workflowRule.delete({ where: { id } });
  await audit({ user, schoolId: before.schoolId, action: "workflow_rule.delete", entityType: "WorkflowRule", entityId: id, before });
}

/** Re-installs any default rule (matched by name) that is missing for the school. Existing rules are left untouched. */
export async function resetDefaults(user: AuthUser) {
  assertPermission(user, "workflows:manage");
  const schoolId = resolveSchoolId(user);
  const existing = await prisma.workflowRule.findMany({ where: { schoolId }, select: { name: true } });
  const names = new Set(existing.map((r) => r.name));
  const missing = DEFAULT_WORKFLOW_RULES.filter((r) => !names.has(r.name));
  if (missing.length) {
    await prisma.workflowRule.createMany({
      data: missing.map((r) => ({ schoolId, name: r.name, description: r.description, trigger: r.trigger, conditions: toJson(r.conditions), actions: toJson(r.actions), isActive: true })),
    });
  }
  await audit({ user, schoolId, action: "workflow_rule.reset_defaults", entityType: "WorkflowRule", metadata: { installed: missing.map((r) => r.name) } });
  return { installed: missing.map((r) => r.name), skipped: DEFAULT_WORKFLOW_RULES.length - missing.length };
}

// ───────────── Runs ─────────────

export async function listRuns(user: AuthUser, query: ListRunsQuery = {}) {
  assertPermission(user, "workflows:manage");
  const schoolId = resolveSchoolId(user);
  return prisma.workflowRun.findMany({
    where: { schoolId, trigger: query.trigger, status: query.status, ruleId: query.ruleId },
    include: runInclude,
    orderBy: { createdAt: "desc" },
    take: 200,
  });
}

// ───────────── Dry run ─────────────

/**
 * Evaluates a rule's conditions against a sample payload and previews what each
 * action would do (interpolated text + resolved recipient spec). Nothing is executed.
 */
export async function testRule(user: AuthUser, ruleId: string, input: TestRuleInput) {
  assertPermission(user, "workflows:manage");
  const rule = await loadRule(user, ruleId);
  const payload: Payload = input.payload;
  const conditions = conditionsSchema.parse(rule.conditions ?? {});
  const actions = actionsSchema.parse(rule.actions ?? []);
  const matched = evaluateConditions(conditions, payload);
  const conditionResults = [
    ...(conditions.all ?? []).map((c) => ({ group: "all" as const, ...c, passed: evaluateCondition(c, payload) })),
    ...(conditions.any ?? []).map((c) => ({ group: "any" as const, ...c, passed: evaluateCondition(c, payload) })),
  ];
  const previews = actions.map((action) => {
    const p = action.params;
    const text = (key: string) => (typeof p[key] === "string" ? interpolate(p[key] as string, payload) : undefined);
    const recipientKey = action.type === "CREATE_TASK" ? "assignee" : action.type === "REQUEST_APPROVAL" ? "requester" : "to";
    const spec = (p[recipientKey] ?? (recipientKey === "requester" ? "payload.requesterUserId" : "admins")) as string | string[];
    const recipients = action.type === "REQUEST_APPROVAL" ? undefined : resolveRecipients(spec, payload);
    return {
      type: action.type,
      wouldExecute: matched,
      recipients,
      preview: {
        title: text("title"),
        body: text("body"),
        link: text("link"),
        subject: text("subject"),
        description: text("description"),
        notificationType: typeof p.type === "string" ? p.type : undefined,
        dueInDays: typeof p.dueInDays === "number" ? p.dueInDays : undefined,
        priority: typeof p.priority === "string" ? p.priority : undefined,
        email: p.email === true,
      },
    };
  });
  return { ruleId: rule.id, ruleName: rule.name, trigger: rule.trigger, isActive: rule.isActive, matched, conditions: conditionResults, actions: previews };
}
