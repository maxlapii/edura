/**
 * Pure rule-evaluation helpers for the workflow engine. No I/O here so these
 * can be unit tested exhaustively.
 */
import { z } from "zod";

export const conditionSchema = z.object({
  field: z.string().min(1),
  op: z.enum(["eq", "neq", "gt", "gte", "lt", "lte", "in", "nin", "contains", "exists", "truthy"]),
  value: z.unknown().optional(),
});
export type Condition = z.infer<typeof conditionSchema>;

export const conditionsSchema = z
  .object({
    all: z.array(conditionSchema).optional(),
    any: z.array(conditionSchema).optional(),
  })
  .default({});
export type Conditions = z.infer<typeof conditionsSchema>;

export const actionSchema = z.object({
  type: z.enum(["SEND_NOTIFICATION", "SEND_EMAIL", "CREATE_TASK", "CREATE_ALERT", "REQUEST_APPROVAL"]),
  params: z.record(z.string(), z.unknown()).default({}),
});
export type Action = z.infer<typeof actionSchema>;
export const actionsSchema = z.array(actionSchema);

export type Payload = Record<string, unknown>;

/** Reads a dotted path ("student.name", "payload.ids") from an object. */
export function getPath(obj: unknown, path: string): unknown {
  if (!path) return obj;
  return path.split(".").reduce<unknown>((acc, key) => {
    if (acc === null || acc === undefined) return undefined;
    if (typeof acc !== "object") return undefined;
    return (acc as Record<string, unknown>)[key];
  }, obj);
}

export function evaluateCondition(c: Condition, payload: Payload): boolean {
  const actual = getPath(payload, c.field);
  const expected = c.value;
  switch (c.op) {
    case "eq":
      return actual === expected;
    case "neq":
      return actual !== expected;
    case "gt":
      return typeof actual === "number" && typeof expected === "number" && actual > expected;
    case "gte":
      return typeof actual === "number" && typeof expected === "number" && actual >= expected;
    case "lt":
      return typeof actual === "number" && typeof expected === "number" && actual < expected;
    case "lte":
      return typeof actual === "number" && typeof expected === "number" && actual <= expected;
    case "in":
      return Array.isArray(expected) && expected.includes(actual);
    case "nin":
      return Array.isArray(expected) && !expected.includes(actual);
    case "contains":
      if (Array.isArray(actual)) return actual.includes(expected);
      if (typeof actual === "string" && typeof expected === "string") return actual.includes(expected);
      return false;
    case "exists":
      return actual !== undefined && actual !== null;
    case "truthy":
      return Boolean(actual);
    default:
      return false;
  }
}

/** Empty conditions match everything. `all` must all pass; `any` needs one. */
export function evaluateConditions(conditions: Conditions | null | undefined, payload: Payload): boolean {
  if (!conditions) return true;
  const all = conditions.all ?? [];
  const any = conditions.any ?? [];
  if (all.length > 0 && !all.every((c) => evaluateCondition(c, payload))) return false;
  if (any.length > 0 && !any.some((c) => evaluateCondition(c, payload))) return false;
  return true;
}

/** Replaces {{dotted.path}} placeholders with payload values. Missing values become "". */
export function interpolate(template: string, payload: Payload): string {
  return template.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_m, path: string) => {
    const v = getPath(payload, path);
    if (v === undefined || v === null) return "";
    if (v instanceof Date) return v.toISOString().slice(0, 10);
    return String(v);
  });
}

/**
 * Resolves the recipients expression of an action into user ids.
 *  - "admins"                → resolved by the engine (returns marker)
 *  - "payload.someField"     → string or string[] taken from the payload
 *  - "user:<id>"             → literal user id
 */
export type RecipientSpec = string | string[];

export function resolveRecipients(spec: RecipientSpec | undefined, payload: Payload): { userIds: string[]; wantsAdmins: boolean } {
  const specs = Array.isArray(spec) ? spec : spec ? [spec] : [];
  const userIds: string[] = [];
  let wantsAdmins = false;
  for (const s of specs) {
    if (s === "admins") {
      wantsAdmins = true;
    } else if (s.startsWith("user:")) {
      userIds.push(s.slice(5));
    } else if (s.startsWith("payload.")) {
      const v = getPath(payload, s.slice(8));
      if (typeof v === "string") userIds.push(v);
      else if (Array.isArray(v)) userIds.push(...v.filter((x): x is string => typeof x === "string"));
    }
  }
  return { userIds: [...new Set(userIds)].filter(Boolean), wantsAdmins };
}
