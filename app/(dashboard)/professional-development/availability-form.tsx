"use client";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { apiFetch } from "@/lib/client/api";
import { Alert, Button } from "@/components/ui";
import { DAY_SHORT } from "@/lib/format";
import { useSubmit } from "../_components/use-submit";

type Type = "" | "AVAILABLE" | "UNAVAILABLE" | "PREFERRED" | "PREFERRED_SUBSTITUTION";
const OPTIONS: Array<{ value: Type; label: string }> = [
  { value: "", label: "—" },
  { value: "AVAILABLE", label: "Available" },
  { value: "UNAVAILABLE", label: "Unavailable" },
  { value: "PREFERRED", label: "Preferred teaching" },
  { value: "PREFERRED_SUBSTITUTION", label: "Preferred for substitution" },
];
const TONE: Record<Exclude<Type, "">, string> = { AVAILABLE: "bg-emerald-50", UNAVAILABLE: "bg-red-50", PREFERRED: "bg-blue-50", PREFERRED_SUBSTITUTION: "bg-purple-50" };

export type Period = { id: string; name: string; startTime: string; endTime: string };
export type Entry = { dayOfWeek: number; periodId: string | null; type: Exclude<Type, ""> };

/** Days × periods grid; only non-empty cells are sent to PUT /api/teachers/[id]/availability. */
export function AvailabilityForm({ teacherId, periods, initial, days = 5 }: { teacherId: string; periods: Period[]; initial: Entry[]; days?: number }) {
  const router = useRouter();
  const { busy, error, run } = useSubmit();
  const [saved, setSaved] = useState(false);
  const [cells, setCells] = useState<Record<string, Type>>(() => Object.fromEntries(initial.filter((e) => e.periodId).map((e) => [`${e.dayOfWeek}:${e.periodId}`, e.type])));
  const dayList = Array.from({ length: days }, (_, i) => i + 1);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    await run(async () => {
      const entries = Object.entries(cells)
        .filter(([, t]) => t !== "")
        .map(([k, t]) => {
          const [d, p] = k.split(":");
          return { dayOfWeek: Number(d), periodId: p, type: t };
        });
      await apiFetch(`/api/teachers/${teacherId}/availability`, { method: "PUT", json: { entries } });
      setSaved(true);
      router.refresh();
    });
  }

  if (periods.length === 0) return <p className="text-sm text-slate-500">The school has not defined any periods yet.</p>;

  return (
    <form onSubmit={onSubmit} data-testid="availability-form" className="space-y-3">
      {error && <Alert tone="error">{error}</Alert>}
      {saved && !error && <Alert tone="success">Availability saved. It is used when suggesting substitutes.</Alert>}
      <div className="overflow-x-auto rounded-card bg-white shadow-card">
        <table className="min-w-full text-xs">
          <thead className="bg-slate-50 text-left font-semibold uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-2 py-2">Period</th>
              {dayList.map((d) => (
                <th key={d} className="px-2 py-2">
                  {DAY_SHORT[d]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {periods.map((p) => (
              <tr key={p.id}>
                <td className="whitespace-nowrap px-2 py-1 text-slate-600">
                  <div className="font-medium text-slate-800">{p.name}</div>
                  {p.startTime}–{p.endTime}
                </td>
                {dayList.map((d) => {
                  const key = `${d}:${p.id}`;
                  const v = cells[key] ?? "";
                  return (
                    <td key={d} className={`px-1 py-1 ${v ? TONE[v] : ""}`}>
                      <select name={`availability-${d}-${p.id}`} value={v} onChange={(e) => setCells((c) => ({ ...c, [key]: e.target.value as Type }))} className="w-full rounded border border-slate-200 bg-white px-1 py-1 text-xs" aria-label={`${DAY_SHORT[d]} ${p.name}`}>
                        {OPTIONS.map((o) => (
                          <option key={o.value} value={o.value}>
                            {o.label}
                          </option>
                        ))}
                      </select>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex items-center gap-3">
        <Button type="submit" size="sm" disabled={busy} data-testid="submit">
          {busy ? "Saving…" : "Save availability"}
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => setCells({})}>
          Clear all
        </Button>
      </div>
    </form>
  );
}
