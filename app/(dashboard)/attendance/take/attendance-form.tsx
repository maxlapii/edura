"use client";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { apiFetch } from "@/lib/client/api";
import { Alert, Button, Input, Select } from "@/components/ui";
import { useSubmit } from "../../_components/use-submit";

export type AttendanceStatus = "PRESENT" | "ABSENT" | "LATE" | "EXCUSED";
const STATUSES: AttendanceStatus[] = ["PRESENT", "ABSENT", "LATE", "EXCUSED"];

export type RosterRow = { id: string; firstName: string; lastName: string; studentNumber: string; status: AttendanceStatus; note: string };

/**
 * Fast attendance entry: every student defaults to PRESENT; change the exceptions and save.
 * Only the rows that differ from "present, no note" are sent; `markAllPresent` covers the rest.
 */
export function AttendanceForm({ sessionId, initialRows }: { sessionId: string; initialRows: RosterRow[] }) {
  const router = useRouter();
  const [rows, setRows] = useState<RosterRow[]>(initialRows);
  const { busy, error, run } = useSubmit();

  function update(id: string, patch: Partial<RosterRow>) {
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    await run(async () => {
      const records = rows.filter((r) => r.status !== "PRESENT" || r.note.trim() !== "").map((r) => ({ studentId: r.id, status: r.status, note: r.note.trim() || null }));
      await apiFetch(`/api/attendance/sessions/${sessionId}`, { method: "PUT", json: { markAllPresent: true, records, submit: true } });
      router.push(`/attendance/sessions/${sessionId}`);
      router.refresh();
    });
  }

  const counts = rows.reduce(
    (acc, r) => ({ ...acc, [r.status]: acc[r.status] + 1 }),
    { PRESENT: 0, ABSENT: 0, LATE: 0, EXCUSED: 0 } as Record<AttendanceStatus, number>,
  );

  return (
    <form onSubmit={onSubmit} data-testid="attendance-form" className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-sm text-slate-600">
          <span className="font-medium text-emerald-700">{counts.PRESENT} present</span> · <span className="text-red-700">{counts.ABSENT} absent</span> · <span className="text-amber-700">{counts.LATE} late</span> · {counts.EXCUSED} excused
        </div>
        <Button type="button" variant="outline" size="sm" onClick={() => setRows((rs) => rs.map((r) => ({ ...r, status: "PRESENT" })))} data-testid="mark-all-present">
          Mark all present
        </Button>
      </div>
      {error && <Alert tone="error">{error}</Alert>}
      <div className="overflow-x-auto rounded-card bg-white shadow-card">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-3 py-2">Student</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">Note</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((r) => (
              <tr key={r.id} data-testid="row" data-id={r.id} className={r.status === "ABSENT" ? "bg-red-50/40" : r.status === "LATE" ? "bg-amber-50/40" : ""}>
                <td className="px-3 py-2">
                  <div className="font-medium text-slate-900">
                    {r.lastName}, {r.firstName}
                  </div>
                  <div className="text-xs text-slate-500">{r.studentNumber}</div>
                </td>
                <td className="px-3 py-2">
                  <div className="flex items-center gap-1">
                    <Select name={`status-${r.id}`} value={r.status} onChange={(e) => update(r.id, { status: e.target.value as AttendanceStatus })} className="w-36" aria-label={`Status for ${r.firstName} ${r.lastName}`}>
                      {STATUSES.map((s) => (
                        <option key={s} value={s}>
                          {s.charAt(0) + s.slice(1).toLowerCase()}
                        </option>
                      ))}
                    </Select>
                    <div className="hidden gap-1 sm:flex">
                      {STATUSES.filter((s) => s !== "PRESENT").map((s) => (
                        <button key={s} type="button" onClick={() => update(r.id, { status: r.status === s ? "PRESENT" : s })} className={`rounded px-1.5 py-0.5 text-xs ${r.status === s ? "bg-slate-800 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`} aria-label={`Mark ${r.firstName} ${s.toLowerCase()}`}>
                          {s.charAt(0)}
                        </button>
                      ))}
                    </div>
                  </div>
                </td>
                <td className="px-3 py-2">
                  <Input name={`note-${r.id}`} value={r.note} onChange={(e) => update(r.id, { note: e.target.value })} maxLength={300} placeholder="Optional note" aria-label={`Note for ${r.firstName} ${r.lastName}`} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex items-center gap-2">
        <Button type="submit" disabled={busy} data-testid="submit">
          {busy ? "Saving…" : "Save attendance"}
        </Button>
        <span className="text-xs text-slate-500">Saving submits the session. You can still correct it later today.</span>
      </div>
    </form>
  );
}
