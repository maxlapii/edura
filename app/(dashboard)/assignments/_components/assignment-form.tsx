"use client";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { apiFetch } from "@/lib/client/api";
import { Alert, Button, Field, Input, Select, Textarea } from "@/components/ui";
import { useSubmit } from "../../_components/use-submit";

export type CourseOption = { id: string; label: string };
export type AssignmentValues = { courseId: string; title: string; description: string; dueDate: string; maxScore: number; status: "DRAFT" | "PUBLISHED" | "CLOSED" };
/** `dueDate` arrives from the server as an ISO string and is shown as a local `datetime-local` value. */
export type AssignmentInitial = Partial<Omit<AssignmentValues, "dueDate">> & { dueDate?: string | null };

/** Converts a Date/ISO string to the `datetime-local` input format in the browser's local time. */
function toLocalInput(value: Date | string | null | undefined): string {
  if (!value) return "";
  const d = typeof value === "string" ? new Date(value) : value;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/**
 * Create (POST /api/assignments) or edit (PATCH /api/assignments/[id]) an assignment.
 * `dueDate` is entered with a datetime-local input and sent as an ISO string.
 */
export function AssignmentForm({ courses, initial, assignmentId, onSaved }: { courses: CourseOption[]; initial: AssignmentInitial; assignmentId?: string; onSaved?: () => void }) {
  const router = useRouter();
  const { busy, error, run } = useSubmit();
  const [values, setValues] = useState<AssignmentValues>({
    courseId: initial.courseId ?? courses[0]?.id ?? "",
    title: initial.title ?? "",
    description: initial.description ?? "",
    dueDate: toLocalInput(initial.dueDate),
    maxScore: initial.maxScore ?? 100,
    status: initial.status ?? "PUBLISHED",
  });
  const set = <K extends keyof AssignmentValues>(k: K, v: AssignmentValues[K]) => setValues((s) => ({ ...s, [k]: v }));

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    await run(async () => {
      const body = {
        title: values.title,
        description: values.description.trim() || null,
        dueDate: new Date(values.dueDate).toISOString(),
        maxScore: values.maxScore,
        status: values.status,
      };
      if (assignmentId) {
        await apiFetch(`/api/assignments/${assignmentId}`, { method: "PATCH", json: body });
        onSaved?.();
        router.refresh();
      } else {
        const created = await apiFetch<{ id: string }>("/api/assignments", { method: "POST", json: { ...body, courseId: values.courseId } });
        router.push(`/assignments/${created.id}`);
        router.refresh();
      }
    });
  }

  return (
    <form onSubmit={onSubmit} data-testid="assignment-form" className="space-y-4">
      {error && <Alert tone="error">{error}</Alert>}
      {!assignmentId && (
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
      <Field label="Title" htmlFor="title" required>
        <Input id="title" name="title" value={values.title} onChange={(e) => set("title", e.target.value)} required maxLength={160} />
      </Field>
      <Field label="Description" htmlFor="description" hint="Instructions for students. Optional.">
        <Textarea id="description" name="description" value={values.description} onChange={(e) => set("description", e.target.value)} maxLength={5000} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Due date" htmlFor="dueDate" required>
          <Input id="dueDate" name="dueDate" type="datetime-local" value={values.dueDate} onChange={(e) => set("dueDate", e.target.value)} required />
        </Field>
        <Field label="Maximum score" htmlFor="maxScore" required>
          <Input id="maxScore" name="maxScore" type="number" min={1} max={10000} step="any" value={values.maxScore} onChange={(e) => set("maxScore", Number(e.target.value))} required />
        </Field>
        <Field label="Status" htmlFor="status">
          <Select id="status" name="status" value={values.status} onChange={(e) => set("status", e.target.value as AssignmentValues["status"])}>
            <option value="PUBLISHED">Published</option>
            <option value="DRAFT">Draft</option>
            <option value="CLOSED">Closed</option>
          </Select>
        </Field>
      </div>
      <div className="flex gap-2">
        <Button type="submit" disabled={busy || (!assignmentId && !values.courseId)} data-testid="submit">
          {busy ? "Saving…" : assignmentId ? "Save changes" : "Create assignment"}
        </Button>
      </div>
    </form>
  );
}
