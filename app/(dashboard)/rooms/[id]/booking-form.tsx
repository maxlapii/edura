"use client";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { ApiClientError, apiFetch, errorMessage } from "@/lib/client/api";
import { Alert, Button, Field, Input } from "@/components/ui";
import { todayInput } from "@/components/work/datetime";

interface Conflict {
  type: string;
  message: string;
}

export function BookingForm({ roomId, defaultDate }: { roomId: string; defaultDate?: string }) {
  const router = useRouter();
  const [date, setDate] = useState(defaultDate ?? todayInput());
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [purpose, setPurpose] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [conflicts, setConflicts] = useState<Conflict[]>([]);
  const [success, setSuccess] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setConflicts([]);
    setSuccess(false);
    try {
      await apiFetch("/api/rooms/bookings", { method: "POST", json: { roomId, date, startTime, endTime, purpose: purpose || null } });
      setSuccess(true);
      setStartTime("");
      setEndTime("");
      setPurpose("");
      router.refresh();
    } catch (err) {
      setError(errorMessage(err));
      if (err instanceof ApiClientError && err.status === 409 && Array.isArray(err.details)) setConflicts(err.details as Conflict[]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} data-testid="booking-form" className="space-y-3">
      {error && (
        <Alert tone="error" title={conflicts.length ? "Room is not available" : undefined}>
          {conflicts.length ? (
            <ul className="list-disc space-y-0.5 pl-4" data-testid="booking-conflicts">
              {conflicts.map((c, i) => (
                <li key={i}>{c.message}</li>
              ))}
            </ul>
          ) : (
            error
          )}
        </Alert>
      )}
      {success && <Alert tone="success">Room booked.</Alert>}
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Date" htmlFor="b-date" required>
          <Input id="b-date" name="date" type="date" required value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field label="From" htmlFor="b-start" required>
          <Input id="b-start" name="startTime" type="time" required value={startTime} onChange={(e) => setStartTime(e.target.value)} />
        </Field>
        <Field label="To" htmlFor="b-end" required>
          <Input id="b-end" name="endTime" type="time" required value={endTime} onChange={(e) => setEndTime(e.target.value)} />
        </Field>
      </div>
      <Field label="Purpose" htmlFor="b-purpose">
        <Input id="b-purpose" name="purpose" maxLength={500} placeholder="e.g. Parent meeting" value={purpose} onChange={(e) => setPurpose(e.target.value)} />
      </Field>
      <Button type="submit" disabled={busy} data-testid="submit">
        {busy ? "Booking…" : "Book room"}
      </Button>
    </form>
  );
}
