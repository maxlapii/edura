"use client";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { apiFetch } from "@/lib/client/api";
import { Alert, Badge, Button, Input, StatusBadge } from "@/components/ui";
import { fmtDateTime } from "@/lib/format";
import { useSubmit } from "../../_components/use-submit";

export type GradingRow = {
  studentId: string;
  name: string;
  studentNumber: string;
  state: string;
  submittedAt: string | null;
  isLate: boolean;
  content: string | null;
  score: number | null;
  comment: string | null;
  gradeStatus: string | null;
};

/** Inline per-student grade entry. Only rows with a score are sent to POST /api/assignments/[id]/grades. */
export function GradingForm({ assignmentId, maxScore, rows }: { assignmentId: string; maxScore: number; rows: GradingRow[] }) {
  const router = useRouter();
  const { busy, error, run, setError } = useSubmit();
  const [saved, setSaved] = useState<number | null>(null);
  const [open, setOpen] = useState<string | null>(null);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const grades = rows
      .map((r) => ({ studentId: r.studentId, score: String(fd.get(`score-${r.studentId}`) ?? "").trim(), comment: String(fd.get(`comment-${r.studentId}`) ?? "").trim() }))
      .filter((g) => g.score !== "")
      .map((g) => ({ studentId: g.studentId, score: Number(g.score), comment: g.comment || null }));
    if (grades.length === 0) {
      setError("Enter at least one score before saving.");
      return;
    }
    await run(async () => {
      await apiFetch(`/api/assignments/${assignmentId}/grades`, { method: "POST", json: { grades } });
      setSaved(grades.length);
      router.refresh();
    });
  }

  return (
    <form onSubmit={onSubmit} data-testid="grading-form" className="space-y-3">
      {error && <Alert tone="error">{error}</Alert>}
      {saved !== null && !error && <Alert tone="success">Saved {saved} grade{saved === 1 ? "" : "s"}. They stay in draft until you submit the course grades from the gradebook.</Alert>}
      <div className="overflow-x-auto rounded-card bg-white shadow-card">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-3 py-2">Student</th>
              <th className="px-3 py-2">Submission</th>
              <th className="px-3 py-2">Score /{maxScore}</th>
              <th className="px-3 py-2">Comment</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((r) => {
              const locked = r.gradeStatus === "LOCKED";
              return (
                <tr key={r.studentId} data-testid="row" data-id={r.studentId} className="align-top hover:bg-slate-50/60">
                  <td className="px-3 py-2">
                    <div className="font-medium text-slate-900">{r.name}</div>
                    <div className="text-xs text-slate-500">{r.studentNumber}</div>
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap items-center gap-1">
                      <StatusBadge status={r.state} />
                      {r.isLate && <Badge tone="amber">Late</Badge>}
                      {r.gradeStatus && r.gradeStatus !== "DRAFT" && <Badge tone={locked ? "purple" : "blue"}>{locked ? "Locked" : "Submitted"}</Badge>}
                    </div>
                    {r.submittedAt && <div className="mt-0.5 text-xs text-slate-500">{fmtDateTime(r.submittedAt)}</div>}
                    {r.content && (
                      <div className="mt-1">
                        <button type="button" className="text-xs text-brand-700 hover:underline" onClick={() => setOpen((o) => (o === r.studentId ? null : r.studentId))}>
                          {open === r.studentId ? "Hide work" : "View work"}
                        </button>
                        {open === r.studentId && <pre className="mt-1 max-h-48 max-w-md overflow-auto whitespace-pre-wrap rounded bg-slate-50 p-2 text-xs text-slate-700">{r.content}</pre>}
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <Input name={`score-${r.studentId}`} type="number" min={0} max={maxScore} step="any" defaultValue={r.score ?? ""} disabled={locked} className="w-24" aria-label={`Score for ${r.name}`} />
                  </td>
                  <td className="px-3 py-2">
                    <Input name={`comment-${r.studentId}`} defaultValue={r.comment ?? ""} disabled={locked} maxLength={1000} placeholder="Feedback" aria-label={`Comment for ${r.name}`} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="flex items-center gap-3">
        <Button type="submit" disabled={busy} data-testid="submit">
          {busy ? "Saving…" : "Save grades"}
        </Button>
        <span className="text-xs text-slate-500">Rows without a score are left unchanged.</span>
      </div>
    </form>
  );
}
