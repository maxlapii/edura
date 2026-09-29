import Link from "next/link";
import { requireCurrentUser } from "@/lib/auth/session";
import { listReportCards } from "@/modules/reportCards";
import { Alert, EmptyState, PageHeader, StatusBadge, Table, TBody, TD, TH, THead, TR } from "@/components/ui";
import { fmtDate } from "@/lib/format";
import { isAppError } from "@/lib/utils/errors";

export const dynamic = "force-dynamic";

export default async function ReportCardsPage() {
  const user = await requireCurrentUser();
  let cards: Awaited<ReturnType<typeof listReportCards>> = [];
  let error: string | null = null;
  try {
    cards = await listReportCards(user, {});
  } catch (e) {
    error = isAppError(e) ? e.message : "Could not load report cards";
  }
  return (
    <div>
      <PageHeader title="Report cards" description={user.studentId || user.guardianId ? "Published report cards" : "Report cards for your students"} />
      {error && <Alert tone="error">{error}</Alert>}
      {!error && cards.length === 0 && <EmptyState title="No report cards yet" description="Report cards appear here once they are published." />}
      {cards.length > 0 && (
        <Table>
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
                <TD>
                  {c.term.name} · {c.term.academicYear.name}
                </TD>
                <TD>
                  <StatusBadge status={c.status} />
                </TD>
                <TD>{fmtDate(c.publishedAt)}</TD>
              </TR>
            ))}
          </TBody>
        </Table>
      )}
    </div>
  );
}
