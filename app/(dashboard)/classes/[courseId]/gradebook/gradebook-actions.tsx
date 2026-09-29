"use client";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { apiFetch } from "@/lib/client/api";
import { Alert, Button, Field, Input, Select } from "@/components/ui";
import { useSubmit } from "../../../_components/use-submit";

/** "Submit grades" (DRAFT → SUBMITTED for the whole course) plus a small "Add assessment" form. */
export function GradebookActions({ courseId, pending }: { courseId: string; pending: number }) {
  const router = useRouter();
  const submitState = useSubmit();
  const assessmentState = useSubmit();
  const [showForm, setShowForm] = useState(false);

  async function submitGrades() {
    if (!window.confirm(`Submit ${pending} draft grade${pending === 1 ? "" : "s"} for this course? Submitted grades become visible to students and parents.`)) return;
    await submitState.run(async () => {
      await apiFetch("/api/grades/status", { method: "POST", json: { courseId, action: "SUBMIT" } });
      router.refresh();
    });
  }

  async function addAssessment(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    const date = String(fd.get("date") ?? "");
    await assessmentState.run(async () => {
      await apiFetch(`/api/courses/${courseId}/assessments`, {
        method: "POST",
        json: {
          title: String(fd.get("title") ?? ""),
          type: String(fd.get("type") ?? "TEST"),
          date: date ? new Date(`${date}T00:00:00.000Z`).toISOString() : null,
          maxScore: Number(fd.get("maxScore") ?? 100),
          weight: Number(fd.get("weight") ?? 1),
        },
      });
      form.reset();
      setShowForm(false);
      router.refresh();
    });
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" size="sm" onClick={submitGrades} disabled={submitState.busy || pending === 0} data-testid="submit-grades">
          {submitState.busy ? "Submitting…" : `Submit grades${pending ? ` (${pending})` : ""}`}
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={() => setShowForm((v) => !v)} aria-expanded={showForm} data-testid="toggle-assessment-form">
          {showForm ? "Close" : "Add assessment"}
        </Button>
      </div>
      {submitState.error && <Alert tone="error">{submitState.error}</Alert>}
      {showForm && (
        <form onSubmit={addAssessment} data-testid="assessment-form" className="grid gap-3 rounded-md border border-slate-200 bg-slate-50 p-3 sm:grid-cols-5">
          <Field label="Title" htmlFor="assessment-title" required className="sm:col-span-2">
            <Input id="assessment-title" name="title" required maxLength={160} />
          </Field>
          <Field label="Type" htmlFor="assessment-type">
            <Select id="assessment-type" name="type" defaultValue="TEST">
              {["EXAM", "QUIZ", "TEST", "PROJECT", "PRACTICAL", "OTHER"].map((t) => (
                <option key={t} value={t}>
                  {t.charAt(0) + t.slice(1).toLowerCase()}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Date" htmlFor="assessment-date">
            <Input id="assessment-date" name="date" type="date" />
          </Field>
          <Field label="Max score" htmlFor="assessment-max">
            <Input id="assessment-max" name="maxScore" type="number" min={1} step="any" defaultValue={100} />
          </Field>
          <Field label="Weight" htmlFor="assessment-weight">
            <Input id="assessment-weight" name="weight" type="number" min={0} max={100} step="any" defaultValue={1} />
          </Field>
          {assessmentState.error && (
            <div className="sm:col-span-5">
              <Alert tone="error">{assessmentState.error}</Alert>
            </div>
          )}
          <div className="sm:col-span-5">
            <Button type="submit" size="sm" disabled={assessmentState.busy} data-testid="submit">
              {assessmentState.busy ? "Saving…" : "Save assessment"}
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
