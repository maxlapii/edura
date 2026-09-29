"use client";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { apiFetch } from "@/lib/client/api";
import { Alert, Button, Field, Input, Select, Textarea } from "@/components/ui";
import { useSubmit } from "../_components/use-submit";

const TYPES = ["SICK", "PERSONAL", "ANNUAL", "TRAINING", "OTHER"] as const;

/** Teacher leave request → POST /api/leave, then the request detail page. */
export function LeaveForm({ today }: { today: string }) {
  const router = useRouter();
  const { busy, error, run } = useSubmit();
  const [type, setType] = useState<(typeof TYPES)[number]>("PERSONAL");
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(today);
  const [reason, setReason] = useState("");

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    await run(async () => {
      const created = await apiFetch<{ id: string }>("/api/leave", { method: "POST", json: { type, startDate, endDate, reason: reason.trim() || null } });
      router.push(`/leave/${created.id}`);
      router.refresh();
    });
  }

  return (
    <form onSubmit={onSubmit} data-testid="leave-form" className="space-y-4">
      {error && <Alert tone="error">{error}</Alert>}
      <Field label="Type" htmlFor="type" required>
        <Select id="type" name="type" value={type} onChange={(e) => setType(e.target.value as (typeof TYPES)[number])}>
          {TYPES.map((t) => (
            <option key={t} value={t}>
              {t.charAt(0) + t.slice(1).toLowerCase()}
            </option>
          ))}
        </Select>
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="First day" htmlFor="startDate" required>
          <Input id="startDate" name="startDate" type="date" value={startDate} onChange={(e) => { setStartDate(e.target.value); if (endDate < e.target.value) setEndDate(e.target.value); }} required />
        </Field>
        <Field label="Last day" htmlFor="endDate" required>
          <Input id="endDate" name="endDate" type="date" value={endDate} min={startDate} onChange={(e) => setEndDate(e.target.value)} required />
        </Field>
      </div>
      <Field label="Reason" htmlFor="reason" hint="Optional. Visible to the reviewer.">
        <Textarea id="reason" name="reason" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={1000} rows={3} />
      </Field>
      <Button type="submit" disabled={busy} data-testid="submit">
        {busy ? "Submitting…" : "Submit request"}
      </Button>
    </form>
  );
}
