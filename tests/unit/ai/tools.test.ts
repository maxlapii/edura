import { describe, expect, it, vi, beforeEach } from "vitest";
import type { AuthUser } from "@/lib/auth/types";
import { AppError } from "@/lib/utils/errors";

// The registry imports module services which import the Prisma client; keep the DB out of unit tests.
vi.mock("@/lib/db", async () => ({ prisma: {}, ...(await vi.importActual<Record<string, unknown>>("@/generated/prisma/enums")) }));
const listTasks = vi.fn();
vi.mock("@/modules/tasks/service", () => ({ listTasks: (...args: unknown[]) => listTasks(...args) }));
const absentTeachers = vi.fn();
vi.mock("@/modules/leave/service", () => ({ absentTeachers: (...args: unknown[]) => absentTeachers(...args) }));

const { AI_TOOLS, MAX_TOOL_RESULT_CHARS, executeTool, findTool, serializeToolResult, toAnthropicTools, toolsForUser } = await import("@/lib/ai/tools");

const base = { email: "x@edura.local", name: "X", schoolId: "s1", isActive: true } as const;
const admin: AuthUser = { ...base, id: "u-admin", role: "SCHOOL_ADMIN" };
const teacher: AuthUser = { ...base, id: "u-teacher", role: "TEACHER", teacherId: "t1" };
const head: AuthUser = { ...base, id: "u-head", role: "DEPARTMENT_HEAD", teacherId: "t2", departmentId: "d1" };
const student: AuthUser = { ...base, id: "u-student", role: "STUDENT", studentId: "st1" };
const parent: AuthUser = { ...base, id: "u-parent", role: "PARENT", guardianId: "g1" };

const EXPECTED_TOOLS = [
  "get_today_teacher_schedule",
  "get_teacher_workload",
  "get_pending_grades",
  "get_student_attendance",
  "get_class_attendance",
  "get_upcoming_meetings",
  "get_pending_tasks",
  "get_open_maintenance_requests",
  "get_absent_teachers_today",
  "get_repeated_absence_students",
  "get_grade_submission_status",
  "get_school_workload_summary",
  "get_student_summary",
  "list_my_courses",
  "search_school_documents",
];

beforeEach(() => {
  listTasks.mockReset();
  absentTeachers.mockReset();
});

describe("registry", () => {
  it("contains every approved tool exactly once, each with a description and permissions", () => {
    expect(AI_TOOLS.map((t) => t.name).sort()).toEqual([...EXPECTED_TOOLS].sort());
    expect(new Set(AI_TOOLS.map((t) => t.name)).size).toBe(AI_TOOLS.length);
    for (const t of AI_TOOLS) {
      expect(t.description.length).toBeGreaterThan(20);
      expect(t.permissions.length).toBeGreaterThan(0);
      expect(typeof t.execute).toBe("function");
    }
  });
});

describe("toolsForUser", () => {
  it("gives administrators the whole registry", () => {
    expect(toolsForUser(admin).map((t) => t.name).sort()).toEqual([...EXPECTED_TOOLS].sort());
  });

  it("hides admin-only tools from teachers", () => {
    const names = toolsForUser(teacher).map((t) => t.name);
    expect(names).toEqual(expect.arrayContaining(["get_today_teacher_schedule", "get_teacher_workload", "get_pending_grades", "get_pending_tasks", "get_student_summary", "list_my_courses", "search_school_documents", "get_upcoming_meetings", "get_open_maintenance_requests"]));
    expect(names).not.toContain("get_absent_teachers_today");
    expect(names).not.toContain("get_repeated_absence_students");
    expect(names).not.toContain("get_grade_submission_status");
    expect(names).not.toContain("get_school_workload_summary");
  });

  it("lets department heads see school-level reporting tools", () => {
    const names = toolsForUser(head).map((t) => t.name);
    expect(names).toContain("get_absent_teachers_today");
    expect(names).toContain("get_grade_submission_status");
    expect(names).toContain("get_school_workload_summary");
  });

  it("gives students and parents only their narrow read tools", () => {
    for (const u of [student, parent]) {
      const names = toolsForUser(u).map((t) => t.name);
      expect(names).not.toContain("get_pending_tasks");
      expect(names).not.toContain("get_student_summary");
      expect(names).not.toContain("get_pending_grades");
      expect(names).not.toContain("get_absent_teachers_today");
      expect(names).not.toContain("get_school_workload_summary");
    }
  });
});

describe("toAnthropicTools", () => {
  it("produces Anthropic tool definitions with object JSON schemas generated from Zod", () => {
    const defs = toAnthropicTools(toolsForUser(admin));
    expect(defs).toHaveLength(EXPECTED_TOOLS.length);
    for (const d of defs) {
      expect(d.name).toMatch(/^[a-z_]+$/);
      expect(d.description).toBeTruthy();
      expect(d.input_schema.type).toBe("object");
      expect(d.input_schema).not.toHaveProperty("$schema");
    }
    const attendance = defs.find((d) => d.name === "get_student_attendance")!;
    const props = attendance.input_schema.properties as Record<string, { type?: string; pattern?: string }>;
    expect(props.studentId.type).toBe("string");
    expect(props.from.pattern).toContain("\\d{4}");
    expect(attendance.input_schema.required).toEqual(["studentId"]);
    const search = defs.find((d) => d.name === "search_school_documents")!;
    const searchProps = search.input_schema.properties as Record<string, { type?: string; items?: { enum?: string[] } }>;
    expect(searchProps.types.type).toBe("array");
    expect(searchProps.types.items?.enum).toEqual(["announcements", "templates", "lesson_plans"]);
  });
});

describe("serializeToolResult", () => {
  it("returns JSON untouched when small and truncates large payloads", () => {
    expect(serializeToolResult({ a: 1 })).toBe('{"a":1}');
    expect(serializeToolResult("plain")).toBe("plain");
    expect(serializeToolResult({ big: BigInt(5) })).toBe('{"big":"5"}');
    const huge = serializeToolResult({ rows: Array.from({ length: 2000 }, (_, i) => ({ i, label: `row-${i}` })) });
    expect(huge.length).toBeLessThan(MAX_TOOL_RESULT_CHARS + 200);
    expect(huge).toContain("…[truncated");
    expect(huge.startsWith('{"rows":[{"i":0')).toBe(true);
    expect(serializeToolResult("x".repeat(100), 10)).toContain("truncated 90 characters");
  });
});

describe("executeTool", () => {
  it("refuses tools the caller may not see, without calling the service", async () => {
    const r = await executeTool(teacher, "get_absent_teachers_today", {});
    expect(r.ok).toBe(false);
    expect(r.content).toContain("not available");
    expect(absentTeachers).not.toHaveBeenCalled();
    const unknown = await executeTool(admin, "drop_table", {});
    expect(unknown.ok).toBe(false);
  });

  it("validates input against the Zod schema before executing", async () => {
    const r = await executeTool(teacher, "get_pending_tasks", { scope: "everyone" });
    expect(r.ok).toBe(false);
    expect(r.content).toMatch(/Invalid input for get_pending_tasks/);
    expect(listTasks).not.toHaveBeenCalled();
  });

  it("executes a permitted tool with the caller's identity and serializes the result", async () => {
    listTasks.mockResolvedValue([{ id: "task1", title: "Grade essays", status: "TODO", priority: "HIGH", dueDate: new Date("2026-09-30T00:00:00Z"), assignee: { name: "X" }, source: "SELF" }]);
    const r = await executeTool(teacher, "get_pending_tasks", { overdue: true });
    expect(listTasks).toHaveBeenCalledWith(teacher, { status: "OPEN", overdue: true, scope: "mine" });
    expect(r.ok).toBe(true);
    expect(JSON.parse(r.content)).toEqual([{ id: "task1", title: "Grade essays", status: "TODO", priority: "HIGH", dueDate: "2026-09-30", assignee: "X", source: "SELF" }]);
  });

  it("passes the school scope of the caller to school-level services", async () => {
    absentTeachers.mockResolvedValue([{ teacherId: "t9", type: "SICK", startDate: new Date("2026-09-28T00:00:00Z"), endDate: new Date("2026-09-29T00:00:00Z"), teacher: { user: { name: "Ann" }, department: { name: "Science" } } }]);
    const r = await executeTool(admin, "get_absent_teachers_today", { date: "2026-09-28" });
    expect(absentTeachers).toHaveBeenCalledWith("s1", new Date("2026-09-28T00:00:00.000Z"));
    expect(JSON.parse(r.content)).toEqual([{ teacherId: "t9", name: "Ann", department: "Science", leaveType: "SICK", from: "2026-09-28", to: "2026-09-29" }]);
  });

  it("reports service errors back to the model instead of throwing", async () => {
    listTasks.mockRejectedValue(AppError.forbidden("nope"));
    const r = await executeTool(teacher, "get_pending_tasks", {});
    expect(r.ok).toBe(false);
    expect(r.content).toBe("FORBIDDEN: nope");
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    listTasks.mockRejectedValue(new Error("db down"));
    const r2 = await executeTool(teacher, "get_pending_tasks", {});
    expect(r2.ok).toBe(false);
    expect(r2.content).not.toContain("db down");
    spy.mockRestore();
  });

  it("requires a teacher id for teacher-scoped tools when the caller is not a teacher", async () => {
    const r = await executeTool(admin, "get_teacher_workload", {});
    expect(r.ok).toBe(false);
    expect(r.content).toMatch(/teacherId is required/);
    expect(findTool("get_teacher_workload")).toBeDefined();
  });
});
