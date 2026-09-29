"use client";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { ApiClientError, apiFetch, errorMessage } from "@/lib/client/api";
import { Alert, Button, Field, Select, Textarea } from "@/components/ui";
import { DAY_NAMES } from "@/lib/format";

type Option = { value: string; label: string };
type Conflict = { type: string; message: string };

function conflictsOf(err: unknown): Conflict[] {
  if (err instanceof ApiClientError && err.status === 409 && Array.isArray(err.details)) {
    return (err.details as unknown[]).filter((d): d is Conflict => !!d && typeof d === "object" && "message" in d).map((d) => ({ type: String(d.type ?? "CONFLICT"), message: String(d.message) }));
  }
  return [];
}

export function SlotForm({ courses, periods, rooms, defaultCourseId }: { courses: Option[]; periods: Option[]; rooms: Option[]; defaultCourseId?: string }) {
  const router = useRouter();
  const [courseId, setCourseId] = useState(defaultCourseId ?? "");
  const [dayOfWeek, setDayOfWeek] = useState("1");
  const [periodId, setPeriodId] = useState("");
  const [roomId, setRoomId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [conflicts, setConflicts] = useState<Conflict[]>([]);
  const [success, setSuccess] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setConflicts([]);
    setSuccess(null);
    setLoading(true);
    try {
      await apiFetch("/api/timetable", { method: "POST", json: { courseId, dayOfWeek: Number(dayOfWeek), periodId, roomId: roomId || null } });
      setSuccess("Lesson added to the timetable.");
      router.refresh();
    } catch (err) {
      setConflicts(conflictsOf(err));
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit} data-testid="timetable-slot-form" className="space-y-3">
      {error && (
        <Alert tone="error" title={conflicts.length ? "Timetable conflict" : undefined}>
          {conflicts.length ? (
            <ul className="list-disc pl-4" data-testid="conflicts">
              {conflicts.map((c, i) => (
                <li key={i} data-conflict-type={c.type}>
                  <span className="font-medium">{c.type}</span>: {c.message}
                </li>
              ))}
            </ul>
          ) : (
            error
          )}
        </Alert>
      )}
      {success && <Alert tone="success">{success}</Alert>}
      <Field label="Course" htmlFor="slot-courseId" required>
        <Select id="slot-courseId" name="courseId" value={courseId} onChange={(e) => setCourseId(e.target.value)} required>
          <option value="">Select a course…</option>
          {courses.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </Select>
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Day" htmlFor="slot-dayOfWeek" required>
          <Select id="slot-dayOfWeek" name="dayOfWeek" value={dayOfWeek} onChange={(e) => setDayOfWeek(e.target.value)} required>
            {[1, 2, 3, 4, 5, 6, 7].map((d) => (
              <option key={d} value={String(d)}>
                {DAY_NAMES[d]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Period" htmlFor="slot-periodId" required>
          <Select id="slot-periodId" name="periodId" value={periodId} onChange={(e) => setPeriodId(e.target.value)} required>
            <option value="">Select…</option>
            {periods.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <Field label="Room" htmlFor="slot-roomId" hint="Optional">
        <Select id="slot-roomId" name="roomId" value={roomId} onChange={(e) => setRoomId(e.target.value)}>
          <option value="">No room</option>
          {rooms.map((r) => (
            <option key={r.value} value={r.value}>
              {r.label}
            </option>
          ))}
        </Select>
      </Field>
      <Button type="submit" data-testid="submit" disabled={loading}>
        {loading ? "Adding…" : "Add lesson"}
      </Button>
    </form>
  );
}

/** Optional bulk import: JSON array of { courseId, dayOfWeek, periodId, roomId? }. */
export function BulkSlotForm() {
  const router = useRouter();
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setResult(null);
    let slots: unknown;
    try {
      slots = JSON.parse(text);
    } catch {
      setError("Slots must be a valid JSON array");
      return;
    }
    setLoading(true);
    try {
      const data = await apiFetch<unknown>("/api/timetable/bulk", { method: "POST", json: { slots } });
      setResult(JSON.stringify(data, null, 2));
      router.refresh();
    } catch (err) {
      const conflicts = conflictsOf(err);
      setError(conflicts.length ? conflicts.map((c) => `${c.type}: ${c.message}`).join("; ") : errorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit} data-testid="timetable-bulk-form" className="space-y-3">
      {error && <Alert tone="error">{error}</Alert>}
      {result && <pre className="max-h-40 overflow-auto rounded-md bg-slate-900 p-2 text-xs text-slate-100">{result}</pre>}
      <Field label="Slots (JSON)" htmlFor="bulk-slots" hint='[{"courseId":"…","dayOfWeek":1,"periodId":"…","roomId":null}]'>
        <Textarea id="bulk-slots" name="slots" value={text} onChange={(e) => setText(e.target.value)} rows={6} className="font-mono text-xs" />
      </Field>
      <Button type="submit" variant="secondary" data-testid="submit" disabled={loading || !text.trim()}>
        {loading ? "Importing…" : "Import slots"}
      </Button>
    </form>
  );
}
