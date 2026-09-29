"use client";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { apiFetch } from "@/lib/client/api";
import { Alert, Button, Field, Input, Select, Textarea } from "@/components/ui";
import { useSubmit } from "../../_components/use-submit";

export type CourseOption = { id: string; label: string };
export type LessonPlanValues = { courseId: string; title: string; date: string; curriculumTopic: string; objectives: string; activities: string; materials: string; homework: string; notes: string; status: "DRAFT" | "READY" | "COMPLETED" };
type AiDraft = Partial<Pick<LessonPlanValues, "title" | "objectives" | "activities" | "materials" | "homework" | "curriculumTopic">>;

/** Create (POST /api/lesson-plans) or edit (PATCH /api/lesson-plans/[id]) a lesson plan, with an optional AI draft. */
export function LessonPlanForm({ courses, initial, planId, onSaved }: { courses: CourseOption[]; initial: Partial<LessonPlanValues>; planId?: string; onSaved?: () => void }) {
  const router = useRouter();
  const { busy, error, run } = useSubmit();
  const ai = useSubmit();
  const [aiGenerated, setAiGenerated] = useState(false);
  const [values, setValues] = useState<LessonPlanValues>({
    courseId: initial.courseId ?? courses[0]?.id ?? "",
    title: initial.title ?? "",
    date: initial.date ?? "",
    curriculumTopic: initial.curriculumTopic ?? "",
    objectives: initial.objectives ?? "",
    activities: initial.activities ?? "",
    materials: initial.materials ?? "",
    homework: initial.homework ?? "",
    notes: initial.notes ?? "",
    status: initial.status ?? "DRAFT",
  });
  const set = <K extends keyof LessonPlanValues>(k: K, v: LessonPlanValues[K]) => setValues((s) => ({ ...s, [k]: v }));
  const opt = (v: string) => v.trim() || null;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    await run(async () => {
      const body = {
        title: values.title,
        date: values.date || null,
        curriculumTopic: opt(values.curriculumTopic),
        objectives: opt(values.objectives),
        activities: opt(values.activities),
        materials: opt(values.materials),
        homework: opt(values.homework),
        notes: opt(values.notes),
        status: values.status,
        ...(aiGenerated ? { aiGenerated: true } : {}),
      };
      if (planId) {
        await apiFetch(`/api/lesson-plans/${planId}`, { method: "PATCH", json: body });
        onSaved?.();
        router.refresh();
      } else {
        const created = await apiFetch<{ id: string }>("/api/lesson-plans", { method: "POST", json: { ...body, courseId: values.courseId } });
        router.push(`/lesson-plans/${created.id}`);
        router.refresh();
      }
    });
  }

  async function aiDraft() {
    const topic = values.curriculumTopic.trim() || values.title.trim();
    if (!topic) {
      ai.setError("Enter a curriculum topic (or a title) first so the assistant knows what to draft.");
      return;
    }
    await ai.run(async () => {
      const draft = await apiFetch<AiDraft>("/api/ai/lesson-plan", { method: "POST", json: { courseId: values.courseId, topic } });
      setValues((s) => ({
        ...s,
        title: draft.title ?? s.title,
        curriculumTopic: draft.curriculumTopic ?? s.curriculumTopic,
        objectives: draft.objectives ?? s.objectives,
        activities: draft.activities ?? s.activities,
        materials: draft.materials ?? s.materials,
        homework: draft.homework ?? s.homework,
      }));
      setAiGenerated(true);
    });
  }

  return (
    <form onSubmit={onSubmit} data-testid="lesson-plan-form" className="space-y-4">
      {error && <Alert tone="error">{error}</Alert>}
      {ai.error && <Alert tone="error">{ai.error}</Alert>}
      {aiGenerated && <Alert tone="info">This content was drafted by the AI assistant. Review and edit it before saving.</Alert>}
      <div className="grid gap-4 sm:grid-cols-2">
        {!planId && (
          <Field label="Course" htmlFor="courseId" required>
            <Select id="courseId" name="courseId" value={values.courseId} onChange={(e) => set("courseId", e.target.value)} required>
              {courses.length === 0 && <option value="">No courses available</option>}
              {courses.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </Select>
          </Field>
        )}
        <Field label="Date" htmlFor="date">
          <Input id="date" name="date" type="date" value={values.date} onChange={(e) => set("date", e.target.value)} />
        </Field>
      </div>
      <Field label="Title" htmlFor="title" required>
        <Input id="title" name="title" value={values.title} onChange={(e) => set("title", e.target.value)} required maxLength={160} />
      </Field>
      <Field label="Curriculum topic" htmlFor="curriculumTopic">
        <div className="flex gap-2">
          <Input id="curriculumTopic" name="curriculumTopic" value={values.curriculumTopic} onChange={(e) => set("curriculumTopic", e.target.value)} maxLength={200} />
          <Button type="button" variant="outline" onClick={aiDraft} disabled={ai.busy || !values.courseId} data-testid="ai-draft" className="whitespace-nowrap">
            {ai.busy ? "Drafting…" : "AI draft"}
          </Button>
        </div>
      </Field>
      <Field label="Learning objectives" htmlFor="objectives">
        <Textarea id="objectives" name="objectives" value={values.objectives} onChange={(e) => set("objectives", e.target.value)} maxLength={5000} />
      </Field>
      <Field label="Activities" htmlFor="activities">
        <Textarea id="activities" name="activities" value={values.activities} onChange={(e) => set("activities", e.target.value)} maxLength={10000} rows={6} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Materials" htmlFor="materials">
          <Textarea id="materials" name="materials" value={values.materials} onChange={(e) => set("materials", e.target.value)} maxLength={5000} />
        </Field>
        <Field label="Homework" htmlFor="homework">
          <Textarea id="homework" name="homework" value={values.homework} onChange={(e) => set("homework", e.target.value)} maxLength={5000} />
        </Field>
      </div>
      <Field label="Notes" htmlFor="notes" hint="Private notes, e.g. what to change next time.">
        <Textarea id="notes" name="notes" value={values.notes} onChange={(e) => set("notes", e.target.value)} maxLength={5000} />
      </Field>
      <Field label="Status" htmlFor="status" className="sm:w-48">
        <Select id="status" name="status" value={values.status} onChange={(e) => set("status", e.target.value as LessonPlanValues["status"])}>
          <option value="DRAFT">Draft</option>
          <option value="READY">Ready</option>
          <option value="COMPLETED">Completed</option>
        </Select>
      </Field>
      <Button type="submit" disabled={busy || (!planId && !values.courseId)} data-testid="submit">
        {busy ? "Saving…" : planId ? "Save changes" : "Create lesson plan"}
      </Button>
    </form>
  );
}
