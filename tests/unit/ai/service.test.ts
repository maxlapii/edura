import { describe, expect, it, vi, beforeEach } from "vitest";
import type { AuthUser } from "@/lib/auth/types";
import { AppError } from "@/lib/utils/errors";

// ── mocks ─────────────────────────────────────────────────────────────────────
const create = vi.fn();
const getAiClient = vi.fn(() => ({ messages: { create } }));
vi.mock("@/lib/ai/client", () => ({
  AI_MODEL: "claude-sonnet-5",
  getAiClient: () => getAiClient(),
  isAiConfigured: () => true,
}));

const schoolFindUnique = vi.fn();
vi.mock("@/lib/db", async () => ({
  prisma: { school: { findUnique: (...args: unknown[]) => schoolFindUnique(...args) } },
  ...(await vi.importActual<Record<string, unknown>>("@/generated/prisma/enums")),
}));

const audit = vi.fn();
vi.mock("@/lib/audit", () => ({ audit: (...args: unknown[]) => audit(...args) }));

const listTasks = vi.fn();
vi.mock("@/modules/tasks/service", () => ({ listTasks: (...args: unknown[]) => listTasks(...args) }));
const absentTeachers = vi.fn();
vi.mock("@/modules/leave/service", () => ({ absentTeachers: (...args: unknown[]) => absentTeachers(...args) }));
const getCourse = vi.fn();
vi.mock("@/modules/classes/service", () => ({ getCourse: (...args: unknown[]) => getCourse(...args), listMyCourses: vi.fn() }));
const getStudent = vi.fn();
vi.mock("@/modules/students/service", () => ({ getStudent: (...args: unknown[]) => getStudent(...args) }));
const getMeeting = vi.fn();
vi.mock("@/modules/meetings/service", () => ({ getMeeting: (...args: unknown[]) => getMeeting(...args), upcomingMeetingsForUser: vi.fn() }));

const { chat, draftLessonPlan, draftParentMessage, rewriteText, summarizeMeeting, answerAdminQuestion, MAX_TOOL_ROUNDS } = await import("@/modules/ai/service");

// ── fixtures ──────────────────────────────────────────────────────────────────
const base = { email: "x@edura.local", name: "Xavier", schoolId: "s1", isActive: true } as const;
const teacher: AuthUser = { ...base, id: "u-teacher", role: "TEACHER", teacherId: "t1" };
const admin: AuthUser = { ...base, id: "u-admin", role: "SCHOOL_ADMIN" };
const student: AuthUser = { ...base, id: "u-student", role: "STUDENT", studentId: "st1" };

const MODEL = "claude-sonnet-5";
const text = (t: string) => ({ type: "text", text: t });
const toolUse = (id: string, name: string, input: unknown) => ({ type: "tool_use", id, name, input });
const endTurn = (t: string) => ({ model: MODEL, stop_reason: "end_turn", content: [text(t)] });
const toolTurn = (id: string, name: string, input: unknown, preface = "Let me check.") => ({ model: MODEL, stop_reason: "tool_use", content: [text(preface), toolUse(id, name, input)] });

type CreateParams = { model: string; system: string; messages: Array<{ role: string; content: unknown }>; tools?: Array<{ name: string }>; tool_choice?: { type: string } };
const callParams = (n: number) => create.mock.calls[n][0] as CreateParams;

beforeEach(() => {
  create.mockReset();
  getAiClient.mockReset();
  getAiClient.mockImplementation(() => ({ messages: { create } }));
  schoolFindUnique.mockReset().mockResolvedValue({ name: "Demo School" });
  audit.mockReset().mockResolvedValue(undefined);
  listTasks.mockReset();
  absentTeachers.mockReset();
  getCourse.mockReset();
  getStudent.mockReset();
  getMeeting.mockReset();
});

// ── chat ──────────────────────────────────────────────────────────────────────
describe("chat", () => {
  it("runs the agentic loop: executes the requested registry tool as the user and returns the final reply", async () => {
    listTasks.mockResolvedValue([{ id: "task1", title: "Grade essays", status: "TODO", priority: "HIGH", dueDate: new Date("2026-09-25T00:00:00Z"), assignee: { name: "Xavier" }, source: "SELF" }]);
    create.mockResolvedValueOnce(toolTurn("tu1", "get_pending_tasks", { overdue: true })).mockResolvedValueOnce(endTurn("You have 1 overdue task: Grade essays (due 2026-09-25)."));

    const result = await chat(teacher, { messages: [{ role: "user", content: "Which of my tasks are overdue?" }] });

    expect(result).toEqual({ reply: "You have 1 overdue task: Grade essays (due 2026-09-25).", toolCalls: [{ name: "get_pending_tasks", input: { overdue: true }, ok: true }], model: MODEL });
    expect(listTasks).toHaveBeenCalledTimes(1);
    expect(listTasks).toHaveBeenCalledWith(teacher, { status: "OPEN", overdue: true, scope: "mine" });

    // First request: system prompt with role/school/today and only teacher-visible tools.
    expect(create).toHaveBeenCalledTimes(2);
    const first = callParams(0);
    expect(first.model).toBe(MODEL);
    expect(first.system).toContain("Demo School");
    expect(first.system).toContain("Xavier");
    expect(first.system).toContain("role is teacher");
    expect(first.system).toContain(new Date().toISOString().slice(0, 10));
    expect(first.system).toMatch(/Never claim to have created/);
    const toolNames = first.tools!.map((t) => t.name);
    expect(toolNames).toContain("get_pending_tasks");
    expect(toolNames).not.toContain("get_absent_teachers_today");
    expect(first.tool_choice).toEqual({ type: "auto" });
    expect(first.messages).toEqual([{ role: "user", content: "Which of my tasks are overdue?" }]);

    // Second request: assistant tool_use turn echoed back, then the tool_result for tu1.
    const second = callParams(1);
    expect(second.messages).toHaveLength(3);
    expect(second.messages[1]).toEqual({ role: "assistant", content: [text("Let me check."), toolUse("tu1", "get_pending_tasks", { overdue: true })] });
    const results = second.messages[2].content as Array<{ type: string; tool_use_id: string; content: string; is_error?: boolean }>;
    expect(second.messages[2].role).toBe("user");
    expect(results[0].type).toBe("tool_result");
    expect(results[0].tool_use_id).toBe("tu1");
    expect(results[0].is_error).toBeUndefined();
    expect(JSON.parse(results[0].content)).toEqual([{ id: "task1", title: "Grade essays", status: "TODO", priority: "HIGH", dueDate: "2026-09-25", assignee: "Xavier", source: "SELF" }]);

    expect(audit).toHaveBeenCalledWith(expect.objectContaining({ user: teacher, action: "ai.chat", entityType: "AiRequest", metadata: expect.objectContaining({ model: MODEL, toolCalls: [{ name: "get_pending_tasks", ok: true }] }) }));
  });

  it("returns an error tool_result (and never calls the service) when the model asks for a tool the user cannot see", async () => {
    create.mockResolvedValueOnce(toolTurn("tu1", "get_absent_teachers_today", {})).mockResolvedValueOnce(endTurn("I cannot access that information for your role."));
    const result = await chat(teacher, { messages: [{ role: "user", content: "Who is absent today?" }] });
    expect(absentTeachers).not.toHaveBeenCalled();
    expect(result.toolCalls).toEqual([{ name: "get_absent_teachers_today", input: {}, ok: false }]);
    const results = callParams(1).messages[2].content as Array<{ is_error?: boolean; content: string }>;
    expect(results[0].is_error).toBe(true);
    expect(results[0].content).toContain("not available");
  });

  it("stops after MAX_TOOL_ROUNDS tool rounds and forces a final answer without tools", async () => {
    listTasks.mockResolvedValue([]);
    for (let i = 0; i < MAX_TOOL_ROUNDS; i++) create.mockResolvedValueOnce(toolTurn(`tu${i}`, "get_pending_tasks", {}));
    create.mockResolvedValueOnce(endTurn("Final answer."));
    const result = await chat(teacher, { messages: [{ role: "user", content: "loop" }] });
    expect(create).toHaveBeenCalledTimes(MAX_TOOL_ROUNDS + 1);
    expect(callParams(MAX_TOOL_ROUNDS).tool_choice).toEqual({ type: "none" });
    expect(result.reply).toBe("Final answer.");
    expect(result.toolCalls).toHaveLength(MAX_TOOL_ROUNDS);
  });

  it("handles refusals and pause_turn", async () => {
    create.mockResolvedValueOnce({ model: MODEL, stop_reason: "refusal", content: [] });
    expect((await chat(teacher, { messages: [{ role: "user", content: "x" }] })).reply).toMatch(/can't help/);
    create.mockReset();
    create.mockResolvedValueOnce({ model: MODEL, stop_reason: "pause_turn", content: [text("working")] }).mockResolvedValueOnce(endTurn("done"));
    const r = await chat(teacher, { messages: [{ role: "user", content: "x" }] });
    expect(r.reply).toBe("done");
    expect(callParams(1).messages).toHaveLength(2);
  });

  it("validates conversation shape and permissions", async () => {
    await expect(chat(student, { messages: [{ role: "user", content: "hi" }] })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(chat(teacher, { messages: [{ role: "assistant", content: "hi" }] })).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    await expect(chat(teacher, { messages: [{ role: "user", content: "hi" }, { role: "assistant", content: "hello" }] })).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    expect(create).not.toHaveBeenCalled();
  });

  it("fails with BAD_REQUEST when the assistant is not configured", async () => {
    getAiClient.mockImplementation(() => {
      throw AppError.badRequest("AI assistant is not configured (ANTHROPIC_API_KEY missing)");
    });
    await expect(chat(teacher, { messages: [{ role: "user", content: "hi" }] })).rejects.toMatchObject({ code: "BAD_REQUEST", message: expect.stringContaining("ANTHROPIC_API_KEY") });
    await expect(rewriteText(teacher, { text: "hi", instruction: "formal" })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(create).not.toHaveBeenCalled();
    expect(audit).not.toHaveBeenCalled();
  });
});

// ── answerAdminQuestion ──────────────────────────────────────────────────────
describe("answerAdminQuestion", () => {
  it("requires ai:admin and exposes admin tools", async () => {
    await expect(answerAdminQuestion(teacher, { question: "Who is absent today?" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    absentTeachers.mockResolvedValue([]);
    create.mockResolvedValueOnce(toolTurn("tu1", "get_absent_teachers_today", {})).mockResolvedValueOnce(endTurn("Nobody is absent today."));
    const r = await answerAdminQuestion(admin, { question: "Who is absent today?" });
    expect(absentTeachers).toHaveBeenCalledWith("s1", expect.any(Date));
    expect(r).toEqual({ answer: "Nobody is absent today.", toolCalls: [{ name: "get_absent_teachers_today", input: {}, ok: true }], model: MODEL });
    expect(callParams(0).tools!.map((t) => t.name)).toContain("get_school_workload_summary");
    expect(audit).toHaveBeenCalledWith(expect.objectContaining({ action: "ai.answerAdminQuestion" }));
  });
});

// ── drafts ───────────────────────────────────────────────────────────────────
describe("draftLessonPlan", () => {
  const course = { id: "c1", schoolId: "s1", teacherId: "t1", classId: "k1", subjectId: "sub1", subject: { name: "Mathematics" }, class: { name: "10A", gradeLevel: 10 } };

  it("checks course access, retries once on invalid JSON and returns an unsaved draft flagged aiGenerated", async () => {
    getCourse.mockResolvedValue(course);
    create
      .mockResolvedValueOnce(endTurn("Sure! Here is a plan: not json"))
      .mockResolvedValueOnce(endTurn('```json\n{"title":"Fractions","curriculumTopic":"Number","objectives":"Add fractions","activities":"1. Warm-up","materials":null,"homework":"Worksheet"}\n```'));
    const draft = await draftLessonPlan(teacher, { courseId: "c1", topic: "Fractions", duration: 45 });
    expect(getCourse).toHaveBeenCalledWith(teacher, "c1");
    expect(draft).toEqual({ title: "Fractions", curriculumTopic: "Number", objectives: "Add fractions", activities: "1. Warm-up", materials: null, homework: "Worksheet", aiGenerated: true, courseId: "c1" });
    expect(create).toHaveBeenCalledTimes(2);
    expect(callParams(0).messages[0].content).toContain("Mathematics");
    expect(callParams(1).messages).toHaveLength(3); // prompt, bad answer, correction
    expect(audit).toHaveBeenCalledWith(expect.objectContaining({ action: "ai.draftLessonPlan", entityType: "Course", entityId: "c1" }));
  });

  it("gives up after the retry and propagates access errors", async () => {
    getCourse.mockResolvedValue(course);
    create.mockResolvedValue(endTurn("nope"));
    await expect(draftLessonPlan(teacher, { courseId: "c1", topic: "Fractions" })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(create).toHaveBeenCalledTimes(2);
    getCourse.mockRejectedValue(AppError.forbidden("You do not teach this course"));
    await expect(draftLessonPlan(teacher, { courseId: "c2", topic: "Fractions" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(draftLessonPlan(student, { courseId: "c1", topic: "Fractions" })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

describe("draftParentMessage / rewriteText / summarizeMeeting", () => {
  it("drafts a parent message for an accessible student without sending it", async () => {
    getStudent.mockResolvedValue({ id: "st1", schoolId: "s1", firstName: "Lina", lastName: "Ali", class: { name: "10A" } });
    create.mockResolvedValueOnce(endTurn('{"subject":"Lina\'s progress","body":"Dear parent,\\n..."}'));
    const r = await draftParentMessage(teacher, { studentId: "st1", purpose: "Share progress", tone: "formal", points: ["Improved homework"] });
    expect(getStudent).toHaveBeenCalledWith(teacher, "st1");
    expect(r).toEqual({ subject: "Lina's progress", body: "Dear parent,\n...", studentId: "st1" });
    expect(callParams(0).system).toContain("formal");
    expect(callParams(0).messages[0].content).toContain("Improved homework");
    expect(audit).toHaveBeenCalledWith(expect.objectContaining({ action: "ai.draftParentMessage", entityId: "st1" }));
  });

  it("rewrites text", async () => {
    create.mockResolvedValueOnce(endTurn("Rewritten."));
    expect(await rewriteText(teacher, { text: "hello there", instruction: "formal" })).toEqual({ text: "Rewritten." });
    expect(callParams(0).messages[0].content).toContain("Instruction: formal");
    expect(audit).toHaveBeenCalledWith(expect.objectContaining({ action: "ai.rewriteText" }));
  });

  it("summarizes a meeting into a summary and action items", async () => {
    getMeeting.mockResolvedValue({ id: "m1", schoolId: "s1", title: "Staff meeting", type: "STAFF", startsAt: new Date("2026-09-28T09:00:00Z"), agenda: "Budget", minutes: "Discussed budget. Ann to send figures.", decisions: null, participants: [{ user: { name: "Ann" } }], actionItems: [] });
    create.mockResolvedValueOnce(endTurn('{"summary":"Budget discussed.","actionItems":[{"description":"Send figures","assignee":"Ann","dueDate":null}]}'));
    const r = await summarizeMeeting(admin, { meetingId: "m1" });
    expect(r).toEqual({ summary: "Budget discussed.", actionItems: [{ description: "Send figures", assignee: "Ann", dueDate: null }], meetingId: "m1" });
    expect(callParams(0).messages[0].content).toContain("Ann to send figures");
    getMeeting.mockResolvedValue({ id: "m2", schoolId: "s1", title: "Empty", type: "STAFF", startsAt: new Date(), agenda: null, minutes: null, decisions: null, participants: [], actionItems: [] });
    await expect(summarizeMeeting(admin, { meetingId: "m2" })).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
});
