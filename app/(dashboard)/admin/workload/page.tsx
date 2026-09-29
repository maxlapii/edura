import Link from "next/link";
import { requireCurrentUser } from "@/lib/auth/session";
import { schoolWorkload } from "@/modules/timetable";
import { Alert, LinkButton, PageHeader, StatCard, StatusBadge, Table, TBody, TD, TH, THead, TR } from "@/components/ui";
import { FilterBar, FilterField, FilterSelect } from "../_components/filter-bar";
import { guarded, str } from "../_lib/guard";
import { departmentOptions } from "../_lib/options";
import type { PageProps } from "../_lib/types";

export const dynamic = "force-dynamic";

export default async function WorkloadPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const user = await requireCurrentUser();
  const departmentId = str(sp, "departmentId");
  const res = await guarded(() => schoolWorkload(user));
  if (!res.ok) return <Alert tone="error">{res.error}</Alert>;
  const departments = await departmentOptions(user);
  const rows = res.data.filter((r) => !departmentId || r.departmentId === departmentId).sort((a, b) => b.utilization - a.utilization);
  const deptName = (id: string | null) => departments.find((d) => d.value === id)?.label ?? "—";
  const count = (level: string) => rows.filter((r) => r.level === level).length;
  const avg = rows.length ? Math.round(rows.reduce((s, r) => s + r.utilization, 0) / rows.length) : 0;
  return (
    <div className="space-y-4">
      <PageHeader title="Teacher workload" description="Weekly teaching, preparation, substitutions, meetings and duties expressed in periods." actions={<LinkButton href="/api/reports/teacher-workload?format=csv" variant="outline" size="sm" data-testid="csv-link">Download CSV</LinkButton>} />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="Average utilization" value={`${avg}%`} hint={`${rows.length} teachers`} />
        <StatCard label="Overloaded" value={count("OVERLOADED")} tone={count("OVERLOADED") ? "bad" : "good"} hint="≥ 110%" />
        <StatCard label="High" value={count("HIGH")} tone={count("HIGH") ? "warn" : "good"} hint="95–110%" />
        <StatCard label="Underutilized" value={count("UNDERUTILIZED")} tone={count("UNDERUTILIZED") ? "warn" : "good"} hint="< 60%" />
      </div>
      <FilterBar action="/admin/workload">
        <FilterField label="Department">
          <FilterSelect name="departmentId" defaultValue={departmentId ?? ""} options={departments} />
        </FilterField>
      </FilterBar>
      <Table>
        <THead>
          <TR>
            <TH>Teacher</TH>
            <TH>Department</TH>
            <TH>Teaching</TH>
            <TH>Classes</TH>
            <TH>Prep</TH>
            <TH>Subs</TH>
            <TH>Meetings (h)</TH>
            <TH>Duties (h)</TH>
            <TH>Total / max</TH>
            <TH>Utilization</TH>
            <TH>Level</TH>
          </TR>
        </THead>
        <TBody>
          {rows.map((r) => (
            <TR key={r.teacherId} data-testid="row" data-id={r.teacherId} data-level={r.level}>
              <TD>
                <Link href={`/admin/teachers/${r.teacherId}?tab=workload`} className="font-medium text-brand-700 hover:underline">
                  {r.name}
                </Link>
              </TD>
              <TD>{deptName(r.departmentId)}</TD>
              <TD>{r.teachingPeriods}</TD>
              <TD>{r.classes}</TD>
              <TD>{r.preparationPeriods}</TD>
              <TD>{r.substitutionPeriods}</TD>
              <TD>{r.meetingHours.toFixed(1)}</TD>
              <TD>{r.dutyHours}</TD>
              <TD>
                {r.totalPeriods} / {r.maxWeeklyPeriods}
              </TD>
              <TD>
                <div className="flex items-center gap-2">
                  <div className="h-2 w-24 overflow-hidden rounded bg-slate-100">
                    <div className={`h-full ${r.level === "OVERLOADED" ? "bg-red-500" : r.level === "HIGH" ? "bg-amber-500" : r.level === "UNDERUTILIZED" ? "bg-slate-400" : "bg-emerald-500"}`} style={{ width: `${Math.min(100, r.utilization)}%` }} />
                  </div>
                  <span className="tabular-nums">{r.utilization}%</span>
                </div>
              </TD>
              <TD>
                <StatusBadge status={r.level} />
              </TD>
            </TR>
          ))}
          {rows.length === 0 && (
            <TR>
              <TD colSpan={11} className="text-center text-slate-500">
                No teachers.
              </TD>
            </TR>
          )}
        </TBody>
      </Table>
    </div>
  );
}
