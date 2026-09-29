import type Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import type { AuthUser } from "@/lib/auth/types";
import { assertPermission, hasAnyPermission, hasPermission, resolveSchoolId, type Permission } from "@/lib/permissions";
import { AppError, isAppError } from "@/lib/utils/errors";
import { teacherDaySchedule, teacherWorkload, schoolWorkload } from "@/modules/timetable/service";
import { pendingGrading, gradeSubmissionStatus, studentGrades } from "@/modules/grades/service";
import { studentAttendanceSummary, classAttendanceSummary, repeatedAbsenceStudents } from "@/modules/attendance/service";
import { upcomingMeetingsForUser } from "@/modules/meetings/service";
import { listTasks } from "@/modules/tasks/service";
import { listRequests, getMaintenanceDashboard } from "@/modules/facilities/service";
import { absentTeachers } from "@/modules/leave/service";
import { getStudent } from "@/modules/students/service";
import { listMyCourses } from "@/modules/classes/service";
import { listAnnouncementsForUser } from "@/modules/announcements/service";
import { listTemplates } from "@/modules/communication/service";
import { listLessonPlans } from "@/modules/lessonPlans/service";

/**
 * Registry of approved, read-only tools the AI assistant may call.
 *
 * Every tool delegates to an existing module service, so the same permission and school-scope
 * checks apply as for the UI. There is no raw SQL and no write tool. `toolsForUser` filters the
 * registry by the caller's role before the model ever sees a tool definition, and `executeTool`
 * re-checks it at call time.
 */

/** Maximum size of a serialized tool result handed back to the model. */
export const MAX_TOOL_RESULT_CHARS = 8_000;

export interface AiTool<S extends z.ZodType = z.ZodType> {
  name: string;
  description: string;
  /** Zod schema for the tool input; also used to generate the JSON schema sent to the model. */
  input: S;
  /** The caller needs at least one of these permissions to see and call the tool. */
  permissions: Permission[];
  /** Executes the tool as `user`. Must only call existing read services. */
  execute: (user: AuthUser, input: z.output<S>) => Promise<unknown>;
}

function defineTool<S extends z.ZodType>(tool: AiTool<S>): AiTool {
  return tool as unknown as AiTool;
}

// ───────────── helpers ─────────────

const dateInput = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD")
  .describe("Date in YYYY-MM-DD format");

function parseDate(s: string | undefined, fallback = new Date()): Date {
  return s ? new Date(`${s}T00:00:00.000Z`) : fallback;
}

function ymd(d: Date | null | undefined): string | null {
  return d ? new Date(d).toISOString().slice(0, 10) : null;
}

function requireTeacherId(user: AuthUser, explicit?: string): string {
  const id = explicit ?? user.teacherId ?? undefined;
  if (!id) throw AppError.badRequest("A teacherId is required because the current user is not a teacher");
  return id;
}

// ───────────── registry ─────────────

export const AI_TOOLS: AiTool[] = [
  defineTool({
    name: "get_today_teacher_schedule",
    description:
      "Lessons a teacher has on a given day (defaults to today and to the current user when they are a teacher): period, subject, class, room, substitutions and attendance status.",
    input: z.object({
      teacherId: z.string().optional().describe("Teacher id; defaults to the current user's teacher profile"),
      date: dateInput.optional(),
    }),
    permissions: ["timetable:read"],
    execute: async (user, input) => {
      const teacherId = requireTeacherId(user, input.teacherId);
      const result = await teacherDaySchedule(user, teacherId, parseDate(input.date));
      return {
        teacherId,
        date: ymd(result.date),
        dayOfWeek: result.dayOfWeek,
        lessons: result.lessons.map((l) => ({
          period: l.slot.period.name,
          time: `${l.slot.period.startTime}-${l.slot.period.endTime}`,
          subject: l.slot.course.subject.name,
          class: l.slot.course.class.name,
          classId: l.slot.course.class.id,
          courseId: l.slot.courseId,
          students: l.slot.course.class._count.students,
          room: l.slot.room?.name ?? null,
          kind: l.kind,
          coveredBy: l.kind === "OWN" ? (l.coveredBy?.user.name ?? null) : null,
          coveringFor: l.kind === "SUBSTITUTION" ? (l.coveringFor?.user.name ?? null) : null,
          substitutionStatus: l.substitutionStatus,
          attendance: l.attendanceSession?.status ?? "NOT_STARTED",
        })),
      };
    },
  }),

  defineTool({
    name: "get_teacher_workload",
    description: "Weekly workload of a teacher (teaching periods, classes, subjects, preparation, substitutions, meetings, duties, utilization level). Defaults to the current user.",
    input: z.object({ teacherId: z.string().optional().describe("Teacher id; defaults to the current user") }),
    permissions: ["workload:read"],
    execute: async (user, input) => teacherWorkload(user, requireTeacherId(user, input.teacherId)),
  }),

  defineTool({
    name: "get_pending_grades",
    description: "Assignments with submissions that still need grading. Teachers see their own courses; administrators may pass a teacherId or omit it for the whole school.",
    input: z.object({ teacherId: z.string().optional().describe("Restrict to one teacher (admins/department heads only)") }),
    permissions: ["grades:manage"],
    execute: async (user, input) => {
      const rows = await pendingGrading(user, input.teacherId);
      return rows.map((r) => ({
        assignmentId: r.assignment.id,
        title: r.assignment.title,
        dueDate: ymd(r.assignment.dueDate),
        subject: r.assignment.course.subject.name,
        class: r.assignment.course.class.name,
        teacher: r.assignment.course.teacher.user.name,
        pendingSubmissions: r.pending,
        totalSubmissions: r.assignment._count.submissions,
      }));
    },
  }),

  defineTool({
    name: "get_student_attendance",
    description: "Attendance summary for one student: rates, counts, recent absences versus the school threshold and the latest records.",
    input: z.object({ studentId: z.string(), from: dateInput.optional(), to: dateInput.optional() }),
    permissions: ["attendance:read"],
    execute: async (user, input) => {
      const s = await studentAttendanceSummary(user, input.studentId, {
        from: input.from ? parseDate(input.from) : undefined,
        to: input.to ? parseDate(input.to) : undefined,
      });
      return {
        studentId: s.studentId,
        stats: s.stats,
        recentAbsences: s.recentAbsences,
        threshold: s.threshold,
        flagged: s.flagged,
        recentRecords: s.records.slice(0, 20).map((r) => ({ date: ymd(r.date), status: r.status, subject: r.session.course.subject.name, period: r.session.period?.name ?? null, note: r.note ?? null })),
      };
    },
  }),

  defineTool({
    name: "get_class_attendance",
    description: "Per-student attendance summary for a class, including students flagged for repeated absences.",
    input: z.object({ classId: z.string(), from: dateInput.optional(), to: dateInput.optional() }),
    permissions: ["attendance:read"],
    execute: async (user, input) => {
      const s = await classAttendanceSummary(user, input.classId, {
        from: input.from ? parseDate(input.from) : undefined,
        to: input.to ? parseDate(input.to) : undefined,
      });
      return {
        classId: s.classId,
        className: s.className,
        threshold: s.threshold,
        windowDays: s.windowDays,
        overall: s.overall,
        students: s.rows.map((r) => ({ studentId: r.student.id, name: `${r.student.firstName} ${r.student.lastName}`, stats: r.stats, recentAbsences: r.recentAbsences, flagged: r.flagged })),
      };
    },
  }),

  defineTool({
    name: "get_upcoming_meetings",
    description: "Meetings the current user organizes or is invited to in the next N days (default 7).",
    input: z.object({ days: z.number().int().min(1).max(60).optional() }),
    permissions: ["meetings:read"],
    execute: async (user, input) => {
      assertPermission(user, "meetings:read");
      const meetings = await upcomingMeetingsForUser(user.id, input.days ?? 7);
      return meetings.map((m) => ({ id: m.id, title: m.title, type: m.type, startsAt: m.startsAt.toISOString(), endsAt: m.endsAt.toISOString(), room: m.room?.name ?? m.location ?? null, organizer: m.organizer.name, participants: m._count.participants }));
    },
  }),

  defineTool({
    name: "get_pending_tasks",
    description: "Open tasks (to do / in progress) assigned to or created by the current user. Set overdue=true to list only overdue tasks; scope='all' lets administrators see everyone's tasks.",
    input: z.object({ overdue: z.boolean().optional(), scope: z.enum(["mine", "all"]).optional() }),
    permissions: ["tasks:read"],
    execute: async (user, input) => {
      const tasks = await listTasks(user, { status: "OPEN", overdue: input.overdue, scope: input.scope ?? "mine" });
      return tasks.map((t) => ({ id: t.id, title: t.title, status: t.status, priority: t.priority, dueDate: ymd(t.dueDate), assignee: t.assignee.name, source: t.source }));
    },
  }),

  defineTool({
    name: "get_open_maintenance_requests",
    description: "Open, assigned and in-progress maintenance requests visible to the current user, with overdue flags. Managers also get dashboard counts.",
    input: z.object({}),
    permissions: ["maintenance:report", "maintenance:manage"],
    execute: async (user) => {
      const items = (await listRequests(user)).filter((r) => r.status === "OPEN" || r.status === "ASSIGNED" || r.status === "IN_PROGRESS");
      const requests = items.map((r) => ({ id: r.id, title: r.title, category: r.category, priority: r.priority, status: r.status, room: r.room?.name ?? null, reportedBy: r.reportedBy.name, assignedTo: r.assignedTo?.name ?? null, dueDate: ymd(r.dueDate), overdue: r.overdue, createdAt: ymd(r.createdAt) }));
      if (!hasPermission(user, "maintenance:manage")) return { requests };
      const d = await getMaintenanceDashboard(user);
      return { summary: { open: d.open, highPriority: d.highPriority, assigned: d.assigned, inProgress: d.inProgress, overdue: d.overdueCount }, requests };
    },
  }),

  defineTool({
    name: "get_absent_teachers_today",
    description: "Teachers on approved leave on a date (default today), with leave type and dates.",
    input: z.object({ date: dateInput.optional() }),
    permissions: ["leave:read_all"],
    execute: async (user, input) => {
      assertPermission(user, "leave:read_all");
      const leaves = await absentTeachers(resolveSchoolId(user), parseDate(input.date));
      return leaves.map((l) => ({ teacherId: l.teacherId, name: l.teacher?.user.name ?? null, department: l.teacher?.department?.name ?? null, leaveType: l.type, from: ymd(l.startDate), to: ymd(l.endDate) }));
    },
  }),

  defineTool({
    name: "get_repeated_absence_students",
    description: "Students whose absences within the school's absence window reached the configured threshold, most absences first.",
    input: z.object({}),
    permissions: ["reports:school"],
    execute: async (user) => {
      assertPermission(user, "reports:school");
      const rows = await repeatedAbsenceStudents(resolveSchoolId(user));
      return rows.map((r) => ({ studentId: r.student.id, name: `${r.student.firstName} ${r.student.lastName}`, class: r.student.class?.name ?? null, absences: r.absences }));
    },
  }),

  defineTool({
    name: "get_grade_submission_status",
    description: "Grade submission status per course (NONE / PENDING / SUBMITTED / LOCKED) with counts, optionally for one term.",
    input: z.object({ termId: z.string().optional() }),
    permissions: ["reports:school"],
    execute: async (user, input) => {
      const rows = await gradeSubmissionStatus(user, input.termId);
      return rows.map((r) => ({ courseId: r.course.id, subject: r.course.subject.name, class: r.course.class.name, teacher: r.course.teacher.user.name, status: r.status, counts: r.counts, total: r.total }));
    },
  }),

  defineTool({
    name: "get_school_workload_summary",
    description: "Weekly workload for every active teacher (department heads: their department), with utilization level so overloaded and underutilized teachers can be identified.",
    input: z.object({}),
    permissions: ["reports:school"],
    execute: async (user) => {
      const rows = await schoolWorkload(user);
      return rows.map((r) => ({ teacherId: r.teacherId, name: r.name, teachingPeriods: r.teachingPeriods, classes: r.classes, substitutionPeriods: r.substitutionPeriods, meetingHours: r.meetingHours, totalPeriods: r.totalPeriods, maxWeeklyPeriods: r.maxWeeklyPeriods, utilization: r.utilization, level: r.level }));
    },
  }),

  defineTool({
    name: "get_student_summary",
    description: "Profile, attendance summary and grade overview for one student the caller may access. Sensitive fields are omitted unless the caller is allowed to see them.",
    input: z.object({ studentId: z.string() }),
    permissions: ["students:read"],
    execute: async (user, input) => {
      const student = await getStudent(user, input.studentId);
      const [attendance, grades] = await Promise.all([optionalRead(() => studentAttendanceSummary(user, input.studentId)), optionalRead(() => studentGrades(user, input.studentId))]);
      return {
        student: { id: student.id, name: `${student.firstName} ${student.lastName}`, studentNumber: student.studentNumber, status: student.status, class: student.class?.name ?? null, homeroomTeacher: student.class?.homeroomTeacher?.user.name ?? null, guardians: student.guardians.map((g) => g.guardian.user.name), openSupportCases: student.supportCases.filter((c) => c.status !== "RESOLVED").length, recentIncidents: student.disciplineIncidents.length },
        attendance: attendance ? { stats: attendance.stats, recentAbsences: attendance.recentAbsences, threshold: attendance.threshold, flagged: attendance.flagged } : null,
        grades: grades ? { overall: grades.overall, courses: grades.courses.map((c) => ({ subject: c.subject, teacher: c.teacher, average: c.summary.average, graded: c.grades.length })) } : null,
      };
    },
  }),

  defineTool({
    name: "list_my_courses",
    description: "Courses visible to the current user (own courses for teachers, all courses for administrators) with class, subject, teacher and student count.",
    input: z.object({}),
    permissions: ["classes:read"],
    execute: async (user) => {
      const courses = await listMyCourses(user);
      return courses.map((c) => ({ courseId: c.id, subject: c.subject.name, class: c.class.name, classId: c.class.id, gradeLevel: c.class.gradeLevel, teacher: c.teacher.user.name, students: c.class._count.students }));
    },
  }),

  defineTool({
    name: "search_school_documents",
    description: "Case-insensitive text search over school documents the caller may read: announcements, message templates and lesson plans. Returns short excerpts.",
    input: z.object({
      query: z.string().min(2).max(100),
      types: z.array(z.enum(["announcements", "templates", "lesson_plans"])).optional().describe("Restrict to some document types; defaults to all"),
      limit: z.number().int().min(1).max(25).optional(),
    }),
    permissions: ["announcements:read", "messages:send", "lesson_plans:read"],
    execute: async (user, input) => {
      const q = input.query.toLowerCase();
      const limit = input.limit ?? 10;
      const wanted = new Set(input.types ?? ["announcements", "templates", "lesson_plans"]);
      const contains = (...fields: Array<string | null | undefined>) => fields.some((f) => f?.toLowerCase().includes(q));
      const results: Array<{ type: string; id: string; title: string; excerpt: string; date: string | null }> = [];
      if (wanted.has("announcements")) {
        const items = await optionalRead(() => listAnnouncementsForUser(user));
        for (const a of items ?? []) if (contains(a.title, a.body)) results.push({ type: "announcement", id: a.id, title: a.title, excerpt: excerpt(a.body, q), date: ymd(a.publishAt) });
      }
      if (wanted.has("templates")) {
        const items = await optionalRead(() => listTemplates(user));
        for (const t of items ?? []) if (contains(t.name, t.subject, t.body)) results.push({ type: "message_template", id: t.id, title: t.name, excerpt: excerpt(`${t.subject} — ${t.body}`, q), date: null });
      }
      if (wanted.has("lesson_plans")) {
        const items = await optionalRead(() => listLessonPlans(user));
        for (const p of items ?? []) if (contains(p.title, p.curriculumTopic, p.objectives, p.activities, p.homework, p.notes)) results.push({ type: "lesson_plan", id: p.id, title: p.title, excerpt: excerpt([p.curriculumTopic, p.objectives, p.activities].filter(Boolean).join(" "), q), date: ymd(p.date) });
      }
      return { query: input.query, total: results.length, results: results.slice(0, limit) };
    },
  }),
];

/** Runs a read and returns null when the caller lacks access (used for optional sections). */
async function optionalRead<T>(fn: () => Promise<T>): Promise<T | null> {
  try {
    return await fn();
  } catch (err) {
    if (isAppError(err) && (err.code === "FORBIDDEN" || err.code === "NOT_FOUND")) return null;
    throw err;
  }
}

function excerpt(text: string, q: string, radius = 120): string {
  const idx = text.toLowerCase().indexOf(q);
  const start = Math.max(0, (idx < 0 ? 0 : idx) - radius);
  const end = Math.min(text.length, (idx < 0 ? 0 : idx) + q.length + radius);
  return `${start > 0 ? "…" : ""}${text.slice(start, end).replace(/\s+/g, " ").trim()}${end < text.length ? "…" : ""}`;
}

// ───────────── public API ─────────────

/** Tools the caller is allowed to see and call (filtered by role permissions). */
export function toolsForUser(user: Pick<AuthUser, "role">): AiTool[] {
  return AI_TOOLS.filter((t) => hasAnyPermission(user, t.permissions));
}

export function findTool(name: string): AiTool | undefined {
  return AI_TOOLS.find((t) => t.name === name);
}

/** Converts registry tools into Anthropic tool definitions (JSON schema generated from Zod). */
export function toAnthropicTools(tools: AiTool[]): Anthropic.Tool[] {
  return tools.map((t) => {
    const { $schema: _ignored, ...schema } = z.toJSONSchema(t.input, { io: "input", unrepresentable: "any" }) as Record<string, unknown> & { $schema?: string };
    return {
      name: t.name,
      description: t.description,
      input_schema: { ...schema, type: "object" } as Anthropic.Tool["input_schema"],
    };
  });
}

/** Serializes a tool result for the model, truncating very large payloads. */
export function serializeToolResult(value: unknown, max = MAX_TOOL_RESULT_CHARS): string {
  const text = typeof value === "string" ? value : JSON.stringify(value, (_k, v) => (typeof v === "bigint" ? v.toString() : v)) ?? "null";
  if (text.length <= max) return text;
  return `${text.slice(0, max)}\n…[truncated ${text.length - max} characters; ask a narrower question for the rest]`;
}

export interface ToolExecution {
  name: string;
  input: unknown;
  ok: boolean;
  /** Serialized result (or error message) handed back to the model. */
  content: string;
}

/**
 * Executes a registry tool as `user`: the tool must be visible to the caller (permission filter),
 * its input must validate, and the service it calls performs its own object-level checks.
 * Failures are returned (not thrown) so the model can explain them to the user.
 */
export async function executeTool(user: AuthUser, name: string, rawInput: unknown): Promise<ToolExecution> {
  const tool = toolsForUser(user).find((t) => t.name === name);
  if (!tool) return { name, input: rawInput, ok: false, content: `Tool "${name}" is not available to this user.` };
  const parsed = tool.input.safeParse(rawInput ?? {});
  if (!parsed.success) return { name, input: rawInput, ok: false, content: `Invalid input for ${name}: ${parsed.error.issues.map((i) => `${i.path.join(".") || "input"} ${i.message}`).join("; ")}` };
  try {
    const result = await tool.execute(user, parsed.data);
    return { name, input: parsed.data, ok: true, content: serializeToolResult(result) };
  } catch (err) {
    const message = isAppError(err) ? `${err.code}: ${err.message}` : "The tool failed unexpectedly.";
    if (!isAppError(err)) console.error(`[ai] tool ${name} failed`, err);
    return { name, input: parsed.data, ok: false, content: message };
  }
}
