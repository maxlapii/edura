import { prisma } from "@/lib/db";
import type { WorkflowTrigger } from "@/generated/prisma/enums";
import { notify, schoolAdminUserIds } from "@/lib/notifications";
import { sendEmail } from "@/lib/notifications/email";
import { addDays } from "date-fns";
import {
  actionsSchema,
  conditionsSchema,
  evaluateConditions,
  interpolate,
  resolveRecipients,
  type Action,
  type Payload,
} from "./rules";

export interface RunResult {
  ruleId: string;
  ruleName: string;
  status: "SUCCESS" | "SKIPPED" | "FAILED";
  actions: Array<{ type: Action["type"]; detail: string }>;
  error?: string;
}

/**
 * Dispatches a trigger: loads active rules for the school, evaluates their
 * conditions against the payload and executes matching actions. Every run is
 * recorded in WorkflowRun for transparency. Never throws.
 */
export async function dispatch(trigger: WorkflowTrigger, schoolId: string, payload: Payload): Promise<RunResult[]> {
  const rules = await prisma.workflowRule.findMany({ where: { schoolId, trigger, isActive: true } });
  const results: RunResult[] = [];
  for (const rule of rules) {
    const result: RunResult = { ruleId: rule.id, ruleName: rule.name, status: "SUCCESS", actions: [] };
    try {
      const conditions = conditionsSchema.parse(rule.conditions ?? {});
      if (!evaluateConditions(conditions, payload)) {
        result.status = "SKIPPED";
      } else {
        const actions = actionsSchema.parse(rule.actions ?? []);
        for (const action of actions) {
          const detail = await executeAction(action, schoolId, payload);
          result.actions.push({ type: action.type, detail });
        }
      }
    } catch (err) {
      result.status = "FAILED";
      result.error = err instanceof Error ? err.message : String(err);
      console.error(`[workflow] rule "${rule.name}" failed`, err);
    }
    results.push(result);
    try {
      await prisma.workflowRun.create({
        data: {
          schoolId,
          ruleId: rule.id,
          trigger,
          payload: JSON.parse(JSON.stringify(payload)),
          status: result.status,
          result: { actions: result.actions },
          error: result.error ?? null,
        },
      });
    } catch (err) {
      console.error("[workflow] failed to record run", err);
    }
  }
  return results;
}

async function recipientsFor(spec: unknown, schoolId: string, payload: Payload): Promise<string[]> {
  const { userIds, wantsAdmins } = resolveRecipients(spec as string | string[] | undefined, payload);
  if (wantsAdmins) userIds.push(...(await schoolAdminUserIds(schoolId)));
  return [...new Set(userIds)];
}

function str(v: unknown, fallback = ""): string {
  return typeof v === "string" ? v : fallback;
}

async function executeAction(action: Action, schoolId: string, payload: Payload): Promise<string> {
  const p = action.params;
  switch (action.type) {
    case "SEND_NOTIFICATION":
    case "CREATE_ALERT": {
      const to = await recipientsFor(p.to ?? "admins", schoolId, payload);
      const title = interpolate(str(p.title, "Notification"), payload);
      const body = p.body ? interpolate(str(p.body), payload) : null;
      const link = p.link ? interpolate(str(p.link), payload) : null;
      for (const userId of to) {
        await notify({
          schoolId,
          userId,
          type: str(p.type, action.type === "CREATE_ALERT" ? "ALERT" : "GENERIC"),
          title,
          body,
          link,
          email: p.email === true,
        });
      }
      return `${to.length} recipient(s)`;
    }
    case "SEND_EMAIL": {
      const to = await recipientsFor(p.to ?? "admins", schoolId, payload);
      const users = await prisma.user.findMany({ where: { id: { in: to } }, select: { email: true } });
      const subject = interpolate(str(p.subject, "Edura notification"), payload);
      const text = interpolate(str(p.body), payload);
      for (const u of users) await sendEmail({ to: u.email, subject, text });
      return `${users.length} email(s)`;
    }
    case "CREATE_TASK": {
      const assignees = await recipientsFor(p.assignee ?? "admins", schoolId, payload);
      const dueInDays = typeof p.dueInDays === "number" ? p.dueInDays : null;
      let count = 0;
      for (const assigneeUserId of assignees) {
        await prisma.task.create({
          data: {
            schoolId,
            title: interpolate(str(p.title, "Follow up"), payload),
            description: p.description ? interpolate(str(p.description), payload) : null,
            assigneeUserId,
            dueDate: dueInDays !== null ? addDays(new Date(), dueInDays) : null,
            priority: (["LOW", "MEDIUM", "HIGH", "URGENT"] as const).includes(p.priority as never) ? (p.priority as "LOW" | "MEDIUM" | "HIGH" | "URGENT") : "MEDIUM",
            source: "WORKFLOW",
            sourceId: str(payload.sourceId as string, "") || null,
          },
        });
        count++;
      }
      return `${count} task(s)`;
    }
    case "REQUEST_APPROVAL": {
      const requesterUserId = str(getFromPayload(payload, str(p.requester, "payload.requesterUserId")));
      if (!requesterUserId) return "skipped: no requester";
      await prisma.approval.create({
        data: {
          schoolId,
          type: (p.approvalType as "LEAVE" | "EVENT" | "TRIP" | "RESOURCE_REQUEST" | "PURCHASE_REQUEST" | "REPORT_CARD" | "SPECIAL_ACTIVITY") ?? "SPECIAL_ACTIVITY",
          entityType: str(p.entityType, "Workflow"),
          entityId: str(payload.sourceId as string, ""),
          title: interpolate(str(p.title, "Approval requested"), payload),
          requesterUserId,
        },
      });
      return "approval created";
    }
  }
}

function getFromPayload(payload: Payload, expr: string): unknown {
  if (expr.startsWith("payload.")) {
    return expr
      .slice(8)
      .split(".")
      .reduce<unknown>((acc, k) => (acc && typeof acc === "object" ? (acc as Record<string, unknown>)[k] : undefined), payload);
  }
  return expr;
}
