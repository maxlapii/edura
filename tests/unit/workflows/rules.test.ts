import { describe, expect, it } from "vitest";
import { actionsSchema, conditionsSchema, evaluateCondition, evaluateConditions, getPath, interpolate, resolveRecipients } from "@/lib/workflows/rules";
import { DEFAULT_WORKFLOW_RULES } from "@/lib/workflows/defaults";

const payload = { status: "ABSENT", absenceCount: 3, student: { name: "Ava", tags: ["a", "b"] }, guardianUserIds: ["g1", "g2"], empty: null, date: new Date("2026-09-28T00:00:00Z") };

describe("getPath", () => {
  it("reads nested values and tolerates missing paths", () => {
    expect(getPath(payload, "student.name")).toBe("Ava");
    expect(getPath(payload, "student.missing.deep")).toBeUndefined();
    expect(getPath(payload, "")).toBe(payload);
    expect(getPath(null, "x")).toBeUndefined();
  });
});

describe("evaluateCondition", () => {
  it.each([
    [{ field: "status", op: "eq", value: "ABSENT" }, true],
    [{ field: "status", op: "eq", value: "LATE" }, false],
    [{ field: "status", op: "neq", value: "LATE" }, true],
    [{ field: "absenceCount", op: "gt", value: 2 }, true],
    [{ field: "absenceCount", op: "gte", value: 3 }, true],
    [{ field: "absenceCount", op: "lt", value: 3 }, false],
    [{ field: "absenceCount", op: "lte", value: 3 }, true],
    [{ field: "absenceCount", op: "gt", value: "2" }, false],
    [{ field: "status", op: "in", value: ["ABSENT", "LATE"] }, true],
    [{ field: "status", op: "nin", value: ["ABSENT"] }, false],
    [{ field: "status", op: "in", value: "ABSENT" }, false],
    [{ field: "student.tags", op: "contains", value: "a" }, true],
    [{ field: "student.name", op: "contains", value: "v" }, true],
    [{ field: "absenceCount", op: "contains", value: 3 }, false],
    [{ field: "student", op: "exists" }, true],
    [{ field: "empty", op: "exists" }, false],
    [{ field: "guardianUserIds", op: "truthy" }, true],
    [{ field: "nope", op: "truthy" }, false],
  ] as const)("%o → %s", (c, expected) => {
    expect(evaluateCondition(c as never, payload)).toBe(expected);
  });

  it("returns false for unknown operators", () => {
    expect(evaluateCondition({ field: "status", op: "???" as never }, payload)).toBe(false);
  });
});

describe("evaluateConditions", () => {
  it("matches everything when empty", () => {
    expect(evaluateConditions(undefined, payload)).toBe(true);
    expect(evaluateConditions({}, payload)).toBe(true);
    expect(evaluateConditions({ all: [], any: [] }, payload)).toBe(true);
  });
  it("requires all `all` and at least one `any`", () => {
    expect(evaluateConditions({ all: [{ field: "status", op: "eq", value: "ABSENT" }, { field: "absenceCount", op: "gte", value: 3 }] }, payload)).toBe(true);
    expect(evaluateConditions({ all: [{ field: "status", op: "eq", value: "ABSENT" }, { field: "absenceCount", op: "gte", value: 4 }] }, payload)).toBe(false);
    expect(evaluateConditions({ any: [{ field: "status", op: "eq", value: "LATE" }, { field: "absenceCount", op: "gte", value: 3 }] }, payload)).toBe(true);
    expect(evaluateConditions({ any: [{ field: "status", op: "eq", value: "LATE" }] }, payload)).toBe(false);
    expect(evaluateConditions({ all: [{ field: "status", op: "eq", value: "ABSENT" }], any: [{ field: "status", op: "eq", value: "LATE" }] }, payload)).toBe(false);
  });
});

describe("interpolate", () => {
  it("replaces placeholders, formats dates and blanks missing values", () => {
    expect(interpolate("{{student.name}} was {{status}} on {{date}} ({{ missing }})", payload)).toBe("Ava was ABSENT on 2026-09-28 ()");
    expect(interpolate("no placeholders", payload)).toBe("no placeholders");
    expect(interpolate("{{absenceCount}} times", payload)).toBe("3 times");
  });
});

describe("resolveRecipients", () => {
  it("resolves payload paths, literal users and the admins marker", () => {
    expect(resolveRecipients("payload.guardianUserIds", payload)).toEqual({ userIds: ["g1", "g2"], wantsAdmins: false });
    expect(resolveRecipients(["admins", "user:u1", "payload.guardianUserIds", "payload.nope"], payload)).toEqual({ userIds: ["u1", "g1", "g2"], wantsAdmins: true });
    expect(resolveRecipients(undefined, payload)).toEqual({ userIds: [], wantsAdmins: false });
    expect(resolveRecipients("payload.student.name", payload)).toEqual({ userIds: ["Ava"], wantsAdmins: false });
    expect(resolveRecipients("garbage", payload)).toEqual({ userIds: [], wantsAdmins: false });
  });
  it("de-duplicates", () => {
    expect(resolveRecipients(["user:u1", "user:u1"], payload).userIds).toEqual(["u1"]);
  });
});

describe("default rules", () => {
  it("are valid against the schemas and cover the key triggers", () => {
    for (const rule of DEFAULT_WORKFLOW_RULES) {
      expect(() => conditionsSchema.parse(rule.conditions)).not.toThrow();
      expect(() => actionsSchema.parse(rule.actions)).not.toThrow();
      expect(rule.actions.length).toBeGreaterThan(0);
    }
    const triggers = new Set(DEFAULT_WORKFLOW_RULES.map((r) => r.trigger));
    for (const t of ["ATTENDANCE_RECORDED", "ABSENCE_THRESHOLD_REACHED", "LEAVE_REQUESTED", "LEAVE_APPROVED", "CERTIFICATION_EXPIRING", "GRADE_MISSING", "ASSIGNMENT_OVERDUE", "TASK_OVERDUE", "MAINTENANCE_CREATED"]) {
      expect(triggers.has(t as never)).toBe(true);
    }
  });
  it("the absence rule only fires for ABSENT", () => {
    const rule = DEFAULT_WORKFLOW_RULES.find((r) => r.name.includes("absent"))!;
    expect(evaluateConditions(rule.conditions, { status: "ABSENT" })).toBe(true);
    expect(evaluateConditions(rule.conditions, { status: "LATE" })).toBe(false);
  });
  it("rejects invalid actions", () => {
    expect(() => actionsSchema.parse([{ type: "DELETE_EVERYTHING" }])).toThrow();
    expect(() => conditionsSchema.parse({ all: [{ field: "", op: "eq" }] })).toThrow();
  });
});
