"use client";
import { useRouter } from "next/navigation";
import type { FormEvent } from "react";
import { apiFetch } from "@/lib/client/api";
import { Alert, Button, Field, Input, Select, Textarea } from "@/components/ui";
import { useSubmit } from "../_components/use-submit";

const TYPES = ["TRAINING", "WORKSHOP", "COURSE", "OBSERVATION", "GOAL", "DEVELOPMENT_PLAN"];
const STATUSES = ["PLANNED", "IN_PROGRESS", "COMPLETED"];
const label = (v: string) => v.charAt(0) + v.slice(1).toLowerCase().replace(/_/g, " ");

export function PdForm({ teacherId }: { teacherId: string }) {
  const router = useRouter();
  const { busy, error, run } = useSubmit();
  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    const hours = String(fd.get("hours") ?? "").trim();
    await run(async () => {
      await apiFetch(`/api/teachers/${teacherId}/professional-development`, {
        method: "POST",
        json: { type: String(fd.get("type")), title: String(fd.get("title") ?? ""), date: String(fd.get("date") ?? "").trim() || null, hours: hours ? Number(hours) : null, notes: String(fd.get("notes") ?? "").trim() || null, status: String(fd.get("status")) },
      });
      form.reset();
      router.refresh();
    });
  }
  return (
    <form onSubmit={onSubmit} data-testid="pd-form" className="grid gap-3 sm:grid-cols-4">
      {error && (
        <div className="sm:col-span-4">
          <Alert tone="error">{error}</Alert>
        </div>
      )}
      <Field label="Title" htmlFor="pd-title" required className="sm:col-span-2">
        <Input id="pd-title" name="title" required maxLength={160} />
      </Field>
      <Field label="Type" htmlFor="pd-type">
        <Select id="pd-type" name="type" defaultValue="TRAINING">
          {TYPES.map((t) => (
            <option key={t} value={t}>
              {label(t)}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Status" htmlFor="pd-status">
        <Select id="pd-status" name="status" defaultValue="PLANNED">
          {STATUSES.map((t) => (
            <option key={t} value={t}>
              {label(t)}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Date" htmlFor="pd-date">
        <Input id="pd-date" name="date" type="date" />
      </Field>
      <Field label="Hours" htmlFor="pd-hours">
        <Input id="pd-hours" name="hours" type="number" min={0} step="any" />
      </Field>
      <Field label="Notes" htmlFor="pd-notes" className="sm:col-span-2">
        <Textarea id="pd-notes" name="notes" maxLength={2000} className="min-h-[40px]" rows={1} />
      </Field>
      <div className="sm:col-span-4">
        <Button type="submit" size="sm" disabled={busy} data-testid="submit">
          {busy ? "Saving…" : "Add record"}
        </Button>
      </div>
    </form>
  );
}
