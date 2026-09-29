import Link from "next/link";
import { notFound } from "next/navigation";
import { requireCurrentUser } from "@/lib/auth/session";
import { generateReport, isReportName, REPORT_CATALOG } from "@/modules/reports";
import { Alert, DescriptionList, LinkButton, PageHeader, Table, TBody, TD, TH, THead, TR } from "@/components/ui";
import { fmtDateTime, humanize } from "@/lib/format";
import { FilterBar, FilterField, FilterInput, FilterSelect } from "../../_components/filter-bar";
import { dateParam, guarded, qs, str } from "../../_lib/guard";
import { allTeacherOptions, classOptions, termOptions } from "../../_lib/options";
import type { PageProps } from "../../_lib/types";

export const dynamic = "force-dynamic";

function cell(v: unknown): string {
  if (v === null || v === undefined) return "—";
  if (v instanceof Date) return fmtDateTime(v);
  if (typeof v === "boolean") return v ? "Yes" : "No";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

export default async function ReportPage({ params, searchParams }: PageProps<{ name: string }>) {
  const [{ name }, sp] = await Promise.all([params, searchParams]);
  if (!isReportName(name)) notFound();
  const user = await requireCurrentUser();
  const filters = { from: str(sp, "from"), to: str(sp, "to"), classId: str(sp, "classId"), teacherId: str(sp, "teacherId"), termId: str(sp, "termId") };
  const res = await guarded(() => generateReport(user, name, { ...filters, from: dateParam(sp, "from"), to: dateParam(sp, "to"), format: "json" }));
  const report = res.ok ? res.data : null;
  const [classes, teachers, terms] = await Promise.all([classOptions(user), allTeacherOptions(user), termOptions(user)]);
  const meta = REPORT_CATALOG.find((r) => r.name === name);
  const csv = `/api/reports/${name}${qs({ ...filters, format: "csv" })}`;
  return (
    <div className="space-y-4">
      <PageHeader
        title={report?.title ?? meta?.title ?? name}
        description={report ? `Generated ${fmtDateTime(report.generatedAt)} · ${report.rows.length} rows` : "Choose the filters for this report."}
        breadcrumb={
          <Link href="/admin/reports" className="hover:underline">
            Reports
          </Link>
        }
        actions={
          report && (
            <LinkButton href={csv} variant="outline" size="sm" data-testid="csv-link">
              Download CSV
            </LinkButton>
          )
        }
      />
      <FilterBar action={`/admin/reports/${name}`}>
        <FilterField label="From">
          <FilterInput name="from" type="date" defaultValue={filters.from} />
        </FilterField>
        <FilterField label="To">
          <FilterInput name="to" type="date" defaultValue={filters.to} />
        </FilterField>
        <FilterField label="Class">
          <FilterSelect name="classId" defaultValue={filters.classId ?? ""} options={classes} />
        </FilterField>
        <FilterField label="Teacher">
          <FilterSelect name="teacherId" defaultValue={filters.teacherId ?? ""} options={teachers} />
        </FilterField>
        <FilterField label="Term">
          <FilterSelect name="termId" defaultValue={filters.termId ?? ""} options={terms} />
        </FilterField>
      </FilterBar>
      {!res.ok && <Alert tone="warning">{res.error}</Alert>}
      {report && report.summary && Object.keys(report.summary).length > 0 && (
        <div className="rounded-card bg-white shadow-card p-4" data-testid="summary">
          <DescriptionList items={Object.entries(report.summary).map(([k, v]) => ({ label: humanize(k.replace(/([a-z])([A-Z])/g, "$1_$2")), value: cell(v) }))} />
        </div>
      )}
      {report && (
      <Table>
        <THead>
          <TR>
            {report.columns.map((c) => (
              <TH key={c}>{humanize(c.replace(/([a-z])([A-Z])/g, "$1_$2"))}</TH>
            ))}
          </TR>
        </THead>
        <TBody>
          {report.rows.map((row, i) => (
            <TR key={i} data-testid="row">
              {report.columns.map((c) => (
                <TD key={c}>{cell(row[c])}</TD>
              ))}
            </TR>
          ))}
          {report.rows.length === 0 && (
            <TR>
              <TD colSpan={Math.max(1, report.columns.length)} className="text-center text-slate-500">
                No data for this filter.
              </TD>
            </TR>
          )}
        </TBody>
      </Table>
      )}
    </div>
  );
}
