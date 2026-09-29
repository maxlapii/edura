import Link from "next/link";
import { requireCurrentUser } from "@/lib/auth/session";
import { REPORT_CATALOG } from "@/modules/reports";
import { Badge, PageHeader } from "@/components/ui";

export const dynamic = "force-dynamic";

const DESCRIPTIONS: Record<string, string> = {
  "teacher-workload": "Weekly periods, utilization and workload level per teacher.",
  "teacher-attendance": "Teacher leave over a period.",
  "student-attendance": "Attendance statistics per student.",
  "class-attendance": "Attendance statistics for one class.",
  "assignment-completion": "Submitted, late and missing work per assignment.",
  "grading-status": "Which assignments still have pending grades.",
  "curriculum-progress": "Lesson plans completed per course.",
  leave: "All leave requests in a period.",
  substitution: "Substitutions and who covered them.",
  maintenance: "Maintenance requests and resolution times.",
  events: "School events in a period.",
  tasks: "Tasks and their status.",
  "class-performance": "Average scores per class.",
};

export default async function ReportsPage() {
  await requireCurrentUser();
  return (
    <div className="space-y-4">
      <PageHeader title="Reports" description="Practical operational reports. Every report can be downloaded as CSV." />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {REPORT_CATALOG.map((r) => (
          <Link key={r.name} href={`/admin/reports/${r.name}`} className="rounded-card bg-white p-4 shadow-card transition hover:border-brand-300" data-testid="report-card" data-id={r.name}>
            <div className="flex items-start justify-between gap-2">
              <h2 className="text-sm font-semibold text-slate-900">{r.title}</h2>
              <Badge tone={r.audience === "school" ? "blue" : "gray"}>{r.audience}</Badge>
            </div>
            <p className="mt-1 text-xs text-slate-500">{DESCRIPTIONS[r.name]}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
