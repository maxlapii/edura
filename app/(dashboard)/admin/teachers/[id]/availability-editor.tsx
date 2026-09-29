"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { apiFetch, errorMessage } from "@/lib/client/api";
import { Alert, Button, Select } from "@/components/ui";
import { DAY_SHORT } from "@/lib/format";

export type AvailabilityType = "AVAILABLE" | "UNAVAILABLE" | "PREFERRED" | "PREFERRED_SUBSTITUTION";
export interface AvailabilityEntry {
  dayOfWeek: number;
  periodId: string | null;
  type: AvailabilityType;
  note?: string | null;
}

const TYPES: Array<{ value: AvailabilityType | ""; label: string }> = [
  { value: "", label: "—" },
  { value: "AVAILABLE", label: "Available" },
  { value: "UNAVAILABLE", label: "Unavailable" },
  { value: "PREFERRED", label: "Preferred teaching" },
  { value: "PREFERRED_SUBSTITUTION", label: "Preferred substitution" },
];

const TONES: Record<string, string> = {
  AVAILABLE: "bg-emerald-50",
  UNAVAILABLE: "bg-red-50",
  PREFERRED: "bg-blue-50",
  PREFERRED_SUBSTITUTION: "bg-purple-50",
};

const key = (d: number, p: string | null) => `${d}:${p ?? "day"}`;

/** Grid of day × period selects; PUT /api/teachers/[id]/availability replaces every entry. */
export function AvailabilityEditor({ teacherId, periods, entries, days = [1, 2, 3, 4, 5] }: { teacherId: string; periods: Array<{ id: string; name: string }>; entries: AvailabilityEntry[]; days?: number[] }) {
  const router = useRouter();
  const [values, setValues] = useState<Record<string, AvailabilityType | "">>(() => Object.fromEntries(entries.map((e) => [key(e.dayOfWeek, e.periodId), e.type])));
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(false);

  function set(k: string, v: string) {
    setValues((prev) => ({ ...prev, [k]: v as AvailabilityType | "" }));
    setSaved(false);
  }

  async function save() {
    setLoading(true);
    setError(null);
    try {
      const list: AvailabilityEntry[] = [];
      for (const d of days) {
        const whole = values[key(d, null)];
        if (whole) list.push({ dayOfWeek: d, periodId: null, type: whole });
        for (const p of periods) {
          const v = values[key(d, p.id)];
          if (v) list.push({ dayOfWeek: d, periodId: p.id, type: v });
        }
      }
      await apiFetch(`/api/teachers/${teacherId}/availability`, { method: "PUT", json: { entries: list } });
      setSaved(true);
      router.refresh();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  const rows: Array<{ id: string | null; name: string }> = [{ id: null, name: "Whole day" }, ...periods];
  return (
    <form
      data-testid="availability-form"
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
      className="space-y-3"
    >
      {error && <Alert tone="error">{error}</Alert>}
      {saved && <Alert tone="success">Availability saved.</Alert>}
      <div className="overflow-x-auto rounded-card bg-white shadow-card">
        <table className="min-w-full text-xs">
          <thead className="bg-slate-50 text-left font-semibold uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-2 py-2">Period</th>
              {days.map((d) => (
                <th key={d} className="px-2 py-2">
                  {DAY_SHORT[d]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((r) => (
              <tr key={r.id ?? "day"}>
                <td className="px-2 py-1 font-medium text-slate-700">{r.name}</td>
                {days.map((d) => {
                  const k = key(d, r.id);
                  const v = values[k] ?? "";
                  return (
                    <td key={d} className={`px-1 py-1 ${TONES[v] ?? ""}`}>
                      <Select name={`availability[${k}]`} value={v} onChange={(e) => set(k, e.target.value)} className="h-8 min-w-[9rem] py-0 text-xs" aria-label={`${DAY_SHORT[d]} ${r.name}`}>
                        {TYPES.map((t) => (
                          <option key={t.value} value={t.value}>
                            {t.label}
                          </option>
                        ))}
                      </Select>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Button type="submit" data-testid="submit" disabled={loading}>
        {loading ? "Saving…" : "Save availability"}
      </Button>
    </form>
  );
}
