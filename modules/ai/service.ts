import type Anthropic from "@anthropic-ai/sdk";
import type { z } from "zod";
import { prisma } from "@/lib/db";
import type { AuthUser } from "@/lib/auth/types";
import { assertPermission, hasAnyPermission } from "@/lib/permissions";
import { AppError } from "@/lib/utils/errors";
import { audit } from "@/lib/audit";
import { AI_MODEL, getAiClient } from "@/lib/ai/client";
import { executeTool, findTool, toAnthropicTools, toolsForUser, type AiTool } from "@/lib/ai/tools";
import { getCourse } from "@/modules/classes/service";
import { getStudent } from "@/modules/students/service";
import { getMeeting } from "@/modules/meetings/service";
import {
  lessonPlanDraftSchema,
  meetingSummaryDraftSchema,
  parentMessageDraftSchema,
  type AdminQuestionInput,
  type ChatInput,
  type DraftLessonPlanInput,
  type DraftParentMessageInput,
  type LessonPlanDraft,
  type MeetingSummaryInput,
  type RewriteTextInput,
  type StudentSummaryInput,
} from "./schema";

/**
 * AI assistant services. The model is an assistant layer on top of Edura: it can only read data
 * through the approved tool registry (`lib/ai/tools`), never writes records and never sends
 * messages. Drafts are returned to the caller for editing. Every call is audited as `ai.<fn>`.
 */

export const MAX_TOOL_ROUNDS = 6;
const MAX_TOKENS = 4096;

export interface ToolCallSummary {
  name: string;
  input: unknown;
  ok: boolean;
}

export interface ChatResult {
  reply: string;
  toolCalls: ToolCallSummary[];
  model: string;
}

// ───────────── helpers ─────────────

function requireAiAccess(user: AuthUser) {
  if (!hasAnyPermission(user, ["ai:teacher", "ai:admin"])) throw AppError.forbidden("Missing permission: ai:teacher or ai:admin");
}

function roleLabel(role: AuthUser["role"]) {
  return role.replace(/_/g, " ").toLowerCase();
}

async function schoolName(user: AuthUser): Promise<string | null> {
  if (!user.schoolId) return null;
  const school = await prisma.school.findUnique({ where: { id: user.schoolId }, select: { name: true } });
  return school?.name ?? null;
}

async function buildSystemPrompt(user: AuthUser, tools: AiTool[]): Promise<string> {
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const weekday = now.toLocaleDateString("en-US", { weekday: "long", timeZone: "UTC" });
  const school = await schoolName(user);
  return [
    `You are the Edura AI assistant, helping staff of ${school ?? "the school"} with everyday school operations.`,
    `You are talking to ${user.name}, whose role is ${roleLabel(user.role)}. Today is ${weekday}, ${today}.`,
    "",
    "Rules:",
    tools.length
      ? "- Use the available tools to look up facts from the Edura database. Only present something as a fact when a tool returned it; when a tool was not used, make clear that you are giving a suggestion, an estimate or general advice."
      : "- You have no data tools in this conversation; make clear that anything you say is a suggestion or general advice, not a fact from Edura's records.",
    "- You cannot change any record. Never claim to have created, updated, sent, approved, assigned or deleted anything. When the user asks for a change, explain which Edura page or workflow to use instead.",
    "- Respect privacy: share only what the tools return and only with this user. Do not speculate about students, families or staff, and do not make employment or performance judgements about teachers.",
    "- If a tool reports FORBIDDEN or NOT_FOUND, say so plainly instead of guessing.",
    "- Be concise and practical: short paragraphs or bullet lists, dates as YYYY-MM-DD, numbers exactly as returned.",
  ].join("\n");
}

function textOf(message: Anthropic.Message): string {
  return message.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();
}

function toMessageParams(messages: ChatInput["messages"]): Anthropic.MessageParam[] {
  if (messages[0]?.role !== "user") throw AppError.validation("The conversation must start with a user message");
  if (messages[messages.length - 1]?.role !== "user") throw AppError.validation("The last message must come from the user");
  return messages.map((m) => ({ role: m.role, content: m.content }));
}

/**
 * Manual agentic loop: call the model, execute any requested tools with the caller's own
 * permissions, feed the results back, and stop when the model answers (or after MAX_TOOL_ROUNDS).
 */
async function runToolLoop(user: AuthUser, system: string, initial: Anthropic.MessageParam[], tools: AiTool[]): Promise<ChatResult> {
  const client = getAiClient();
  const anthropicTools = toAnthropicTools(tools);
  const messages: Anthropic.MessageParam[] = [...initial];
  const toolCalls: ToolCallSummary[] = [];

  for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
    const exhausted = round === MAX_TOOL_ROUNDS;
    const response = await client.messages.create({
      model: AI_MODEL,
      max_tokens: MAX_TOKENS,
      system,
      messages: [...messages],
      ...(anthropicTools.length ? { tools: anthropicTools, tool_choice: { type: exhausted ? "none" : "auto" } } : {}),
    });

    if (response.stop_reason === "refusal") return { reply: "I can't help with that request.", toolCalls, model: response.model };
    if (response.stop_reason === "pause_turn") {
      messages.push({ role: "assistant", content: response.content });
      continue;
    }

    const toolUses = response.content.filter((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
    if (response.stop_reason !== "tool_use" || toolUses.length === 0 || exhausted) {
      const reply = textOf(response) || (exhausted ? "I looked up several things but could not finish an answer; please ask a narrower question." : "I could not produce an answer. Please try rephrasing your question.");
      return { reply, toolCalls, model: response.model };
    }

    messages.push({ role: "assistant", content: response.content });
    const results: Anthropic.ToolResultBlockParam[] = [];
    for (const call of toolUses) {
      const execution = await executeTool(user, call.name, call.input);
      toolCalls.push({ name: execution.name, input: execution.input, ok: execution.ok });
      results.push({ type: "tool_result", tool_use_id: call.id, content: execution.content, is_error: execution.ok ? undefined : true });
    }
    messages.push({ role: "user", content: results });
  }
  /* v8 ignore next -- the loop always returns before this */
  throw AppError.badRequest("AI assistant did not produce a reply");
}

function extractJson(text: string): unknown {
  const stripped = text.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "").trim();
  const start = stripped.indexOf("{");
  const end = stripped.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("No JSON object found");
  return JSON.parse(stripped.slice(start, end + 1));
}

/** Asks the model for a JSON object matching `schema`; retries once with a correction when parsing fails. */
async function generateJson<T>(schema: z.ZodType<T>, system: string, prompt: string): Promise<T> {
  const client = getAiClient();
  const messages: Anthropic.MessageParam[] = [{ role: "user", content: prompt }];
  for (let attempt = 0; attempt < 2; attempt++) {
    const response = await client.messages.create({ model: AI_MODEL, max_tokens: MAX_TOKENS, system, messages });
    if (response.stop_reason === "refusal") throw AppError.badRequest("The AI assistant declined this request.");
    const text = textOf(response);
    try {
      return schema.parse(extractJson(text));
    } catch {
      messages.push({ role: "assistant", content: text || "(empty)" }, { role: "user", content: "That was not a valid JSON object matching the requested keys. Reply again with only the JSON object, no prose and no code fences." });
    }
  }
  throw AppError.badRequest("The AI assistant returned an invalid draft; please try again.");
}

async function generateText(system: string, prompt: string): Promise<string> {
  const client = getAiClient();
  const response = await client.messages.create({ model: AI_MODEL, max_tokens: MAX_TOKENS, system, messages: [{ role: "user", content: prompt }] });
  if (response.stop_reason === "refusal") throw AppError.badRequest("The AI assistant declined this request.");
  const text = textOf(response);
  if (!text) throw AppError.badRequest("The AI assistant returned an empty response; please try again.");
  return text;
}

const DRAFT_RULES = "This is a draft for a human to review and edit before it is saved or sent. Do not invent facts about specific students, staff or events beyond what is provided.";

// ───────────── services ─────────────

/** Conversational assistant with read-only tools (agentic loop, max 6 tool rounds). */
export async function chat(user: AuthUser, input: ChatInput): Promise<ChatResult> {
  requireAiAccess(user);
  const tools = toolsForUser(user);
  const system = await buildSystemPrompt(user, tools);
  const result = await runToolLoop(user, system, toMessageParams(input.messages), tools);
  await audit({ user, action: "ai.chat", entityType: "AiRequest", metadata: { model: result.model, messages: input.messages.length, toolCalls: result.toolCalls.map((t) => ({ name: t.name, ok: t.ok })) } });
  return result;
}

/** Lesson-plan draft for a course the teacher may access. Nothing is saved. */
export async function draftLessonPlan(user: AuthUser, input: DraftLessonPlanInput): Promise<LessonPlanDraft & { courseId: string }> {
  requireAiAccess(user);
  assertPermission(user, "lesson_plans:manage");
  const course = await getCourse(user, input.courseId); // performs assertCourseAccess
  const system = `You are an experienced teacher helping a colleague plan a lesson. ${DRAFT_RULES} Reply with only a JSON object with the keys: title (string, max 160 chars), curriculumTopic (string or null), objectives (string; one learning objective per line), activities (string; timed steps, one per line), materials (string or null), homework (string or null).`;
  const prompt = [
    `Subject: ${course.subject.name}`,
    `Class: ${course.class.name}${course.class.gradeLevel != null ? ` (grade ${course.class.gradeLevel})` : ""}`,
    `Topic: ${input.topic}`,
    `Lesson length: ${input.duration ?? 45} minutes`,
    input.objectives ? `Teacher's objectives: ${input.objectives}` : null,
    input.notes ? `Additional notes: ${input.notes}` : null,
  ]
    .filter(Boolean)
    .join("\n");
  const draft = await generateJson(lessonPlanDraftSchema, system, prompt);
  await audit({ user, schoolId: course.schoolId, action: "ai.draftLessonPlan", entityType: "Course", entityId: course.id, metadata: { model: AI_MODEL, topic: input.topic } });
  return { ...draft, aiGenerated: true, courseId: course.id };
}

/** Parent message draft for a linked student. Nothing is sent. */
export async function draftParentMessage(user: AuthUser, input: DraftParentMessageInput): Promise<{ subject: string; body: string; studentId: string }> {
  requireAiAccess(user);
  assertPermission(user, "messages:send");
  const student = await getStudent(user, input.studentId); // object-level access check
  const studentName = `${student.firstName} ${student.lastName}`;
  const system = `You write messages from a teacher to a student's parent or guardian. ${DRAFT_RULES} Tone: ${input.tone ?? "friendly"} and professional. Sign off as ${user.name}. Reply with only a JSON object with the keys: subject (string), body (string, plain text with line breaks).`;
  const prompt = [
    `Student: ${studentName}${student.class ? ` (class ${student.class.name})` : ""}`,
    `Purpose of the message: ${input.purpose}`,
    input.points?.length ? `Points to include:\n${input.points.map((p) => `- ${p}`).join("\n")}` : null,
  ]
    .filter(Boolean)
    .join("\n");
  const draft = await generateJson(parentMessageDraftSchema, system, prompt);
  await audit({ user, schoolId: student.schoolId, action: "ai.draftParentMessage", entityType: "Student", entityId: student.id, metadata: { model: AI_MODEL, tone: input.tone ?? "friendly" } });
  return { ...draft, studentId: student.id };
}

/** Rewrites arbitrary text following an instruction (e.g. "make it more formal"). */
export async function rewriteText(user: AuthUser, input: RewriteTextInput): Promise<{ text: string }> {
  requireAiAccess(user);
  const system = `You are an editor for school staff. Rewrite the text exactly as instructed, keeping its meaning and any facts, names and dates unchanged. ${DRAFT_RULES} Reply with only the rewritten text, no commentary.`;
  const text = await generateText(system, `Instruction: ${input.instruction}\n\nText:\n${input.text}`);
  await audit({ user, action: "ai.rewriteText", entityType: "AiRequest", metadata: { model: AI_MODEL, instruction: input.instruction, chars: input.text.length } });
  return { text };
}

/** Narrative progress summary built from the student's profile, attendance and grades (facts via the approved tool). */
export async function summarizeStudentProgress(user: AuthUser, input: StudentSummaryInput): Promise<{ summary: string; facts: unknown; studentId: string }> {
  requireAiAccess(user);
  assertPermission(user, "students:read");
  const tool = findTool("get_student_summary");
  if (!tool) throw AppError.badRequest("Student summary tool is unavailable");
  const facts = await tool.execute(user, { studentId: input.studentId }); // getStudent enforces object-level access
  const system = `You summarize a student's progress for a teacher or school leader. Use only the facts provided; they come from Edura's records. ${DRAFT_RULES} Structure: 2–4 short paragraphs covering attendance, academic performance and anything needing follow-up. Mention explicitly when data is missing. Be factual and supportive; do not label the student.`;
  const summary = await generateText(system, `Student record (JSON):\n${JSON.stringify(facts)}`);
  await audit({ user, action: "ai.summarizeStudentProgress", entityType: "Student", entityId: input.studentId, metadata: { model: AI_MODEL } });
  return { summary, facts, studentId: input.studentId };
}

/** Summarizes a meeting's agenda/minutes/decisions and proposes action items (not created as tasks). */
export async function summarizeMeeting(user: AuthUser, input: MeetingSummaryInput): Promise<{ summary: string; actionItems: Array<{ description: string; assignee: string | null; dueDate: string | null }>; meetingId: string }> {
  requireAiAccess(user);
  const meeting = await getMeeting(user, input.meetingId); // participants/organizer/admins only
  if (!meeting.agenda && !meeting.minutes && !meeting.decisions) throw AppError.badRequest("This meeting has no agenda, minutes or decisions to summarize yet.");
  const system = `You summarize school meetings. ${DRAFT_RULES} Reply with only a JSON object with the keys: summary (string, concise, plain text) and actionItems (array of objects with description, assignee (name or null) and dueDate (YYYY-MM-DD or null)). Only list action items that are actually stated in the notes.`;
  const prompt = [
    `Meeting: ${meeting.title} (${meeting.type}) on ${meeting.startsAt.toISOString().slice(0, 10)}`,
    `Participants: ${meeting.participants.map((p) => p.user.name).join(", ") || "n/a"}`,
    meeting.agenda ? `Agenda:\n${meeting.agenda}` : null,
    meeting.minutes ? `Minutes:\n${meeting.minutes}` : null,
    meeting.decisions ? `Decisions:\n${meeting.decisions}` : null,
    meeting.actionItems.length ? `Existing action items:\n${meeting.actionItems.map((a) => `- ${a.description}${a.assignee ? ` (${a.assignee.name})` : ""}`).join("\n")}` : null,
  ]
    .filter(Boolean)
    .join("\n\n");
  const draft = await generateJson(meetingSummaryDraftSchema, system, prompt);
  await audit({ user, schoolId: meeting.schoolId, action: "ai.summarizeMeeting", entityType: "Meeting", entityId: meeting.id, metadata: { model: AI_MODEL, actionItems: draft.actionItems.length } });
  return { ...draft, meetingId: meeting.id };
}

/** Admin Q&A over school data ("Which teachers are absent today?") using the approved tools. */
export async function answerAdminQuestion(user: AuthUser, input: AdminQuestionInput): Promise<{ answer: string; toolCalls: ToolCallSummary[]; model: string }> {
  assertPermission(user, "ai:admin");
  const tools = toolsForUser(user);
  const system = `${await buildSystemPrompt(user, tools)}\n- Answer the administrator's question about today's school operations using the tools; summarize counts and name the records involved.`;
  const result = await runToolLoop(user, system, [{ role: "user", content: input.question }], tools);
  await audit({ user, action: "ai.answerAdminQuestion", entityType: "AiRequest", metadata: { model: result.model, toolCalls: result.toolCalls.map((t) => ({ name: t.name, ok: t.ok })) } });
  return { answer: result.reply, toolCalls: result.toolCalls, model: result.model };
}
