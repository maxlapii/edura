import Link from "next/link";
import { requireCurrentUser } from "@/lib/auth/session";
import { resolveSchoolId } from "@/lib/permissions";
import { prisma } from "@/lib/db";
import { listReportCards } from "@/modules/reportCards";
import { Alert, Card, PageHeader, StatusBadge, Table, TBody, TD, TH, THead, TR } from "@/components/ui";
import { fmtDate } from "@/lib/format";
import { isAppError } from "@/lib/utils/errors";
import { GenerateForm } from "./generate-form";

export const dynamic = "force-dynamic";

export default async function AdminReportCardsPage({ searchParams }: { searchParams: Promise<{ termId?: string; classId?: string; status?: string }> }) {
  const sp = await searchParams;
  const user = await requireCurrentUser();
  if (!user.schoolId) return <Alert tone="info">Open a school first to manage its report cards.</Alert>;
  const schoolId = resolveSchoolId(user);
  const [terms, classes] = await Promise.all([
    prisma.term.findMany({ where: { schoolId }, orderBy: { startDate: "desc" }, include: { academicYear: { select: { name: true } } } }),
    prisma.schoolClass.findMany({ where: { schoolId }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);
  let cards: Awaited<ReturnType<typeof listReportCards>> = [];
  let error: string | null = null;
  try {
    cards = await listReportCards(user, { termId: sp.termId, classId: sp.classId, status: sp.status as "DRAFT" | "PUBLISHED" | undefined });
  } catch (e) {
    error = isAppError(e) ? e.message : "Could not load report cards";
  }
  return (
    <div className="space-y-6">
      <PageHeader title="Report cards" description="Generate drafts from submitted grades, review comments, then publish to students and parents." />
      <Card title="Generate report cards">
        <GenerateForm terms={terms.map((t) => ({ id: t.id, label: `${t.name} · ${t.academicYear.name}` }))} classes={classes} />
      </Card>
      <Card title="Report cards" padded={false}>
        <form className="flex flex-wrap gap-2 border-b border-slate-100 p-3 text-sm" method="get">
          <select name="termId" defaultValue={sp.termId ?? ""} className="rounded-md border border-slate-300 px-2 py-1">
            <option value="">All terms</option>
            {terms.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name} · {t.academicYear.name}
              </option>
            ))}
          </select>
          <select name="classId" defaultValue={sp.classId ?? ""} className="rounded-md border border-slate-300 px-2 py-1">
            <option value="">All classes</option>
            {classes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <select name="status" defaultValue={sp.status ?? ""} className="rounded-md border border-slate-300 px-2 py-1">
            <option value="">Any status</option>
            <option value="DRAFT">Draft</option>
            <option value="PUBLISHED">Published</option>
          </select>
          <button type="submit" className="rounded-md bg-slate-100 px-3 py-1 hover:bg-slate-200">
            Filter
          </button>
        </form>
        {error && (
          <div className="p-3">
            <Alert tone="error">{error}</Alert>
          </div>
        )}
        <Table className="rounded-none border-0">
          <THead>
            <TR>
              <TH>Student</TH>
              <TH>Class</TH>
              <TH>Term</TH>
              <TH>Status</TH>
              <TH>Published</TH>
            </TR>
          </THead>
          <TBody>
            {cards.map((c) => (
              <TR key={c.id} data-testid="row" data-id={c.id}>
                <TD>
                  <Link href={`/report-cards/${c.id}`} className="font-medium text-brand-700 hover:underline">
                    {c.student.firstName} {c.student.lastName}
                  </Link>
                </TD>
                <TD>{c.student.class?.name ?? "—"}</TD>
                <TD>{c.term.name}</TD>
                <TD>
                  <StatusBadge status={c.status} />
                </TD>
                <TD>{fmtDate(c.publishedAt)}</TD>
              </TR>
            ))}
            {cards.length === 0 && (
              <TR>
                <TD colSpan={5} className="text-slate-500">
                  No report cards match the filter.
                </TD>
              </TR>
            )}
          </TBody>
        </Table>
      </Card>
    </div>
  );
}
