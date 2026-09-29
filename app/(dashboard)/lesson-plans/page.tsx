import Link from "next/link";
import { requireCurrentUser } from "@/lib/auth/session";
import { listLessonPlans } from "@/modules/lessonPlans";
import { Card, EmptyState, LinkButton, PageHeader, StatusBadge, Table, TBody, TD, TH, THead, TR } from "@/components/ui";
import { fmtDate } from "@/lib/format";
import { FilterTabs } from "../_components/filter-tabs";
import { ServiceError } from "../_components/service-error";
import { load } from "../_lib/load";
import { param, type SearchParams } from "../_lib/helpers";

export const dynamic = "force-dynamic";

const STATUSES = ["DRAFT", "READY", "COMPLETED"] as const;

export default async function LessonPlansPage(props: { searchParams: Promise<SearchParams> }) {
  const sp = await props.searchParams;
  const user = await requireCurrentUser();
  const raw = param(sp, "status") ?? "all";
  const status = STATUSES.includes(raw as (typeof STATUSES)[number]) ? raw : undefined;
  const result = await load(() => listLessonPlans(user, { status }));
  if (!result.ok) return <ServiceError error={result.error} />;
  const plans = result.data;

  return (
    <div>
      <PageHeader
        title="Lesson plans"
        description="Plan lessons, reuse previous ones and track curriculum progress."
        actions={
          <LinkButton href="/lesson-plans/new" size="sm" data-testid="new-lesson-plan">
            New lesson plan
          </LinkButton>
        }
      />
      <FilterTabs items={[{ value: "all", label: "All" }, { value: "DRAFT", label: "Draft" }, { value: "READY", label: "Ready" }, { value: "COMPLETED", label: "Completed" }]} current={status ?? "all"} hrefFor={(v) => (v === "all" ? "/lesson-plans" : `/lesson-plans?status=${v}`)} />
      {plans.length === 0 ? (
        <EmptyState title="No lesson plans" description="Create a plan for an upcoming lesson, or let the AI assistant draft one." action={<LinkButton href="/lesson-plans/new">New lesson plan</LinkButton>} />
      ) : (
        <Card padded={false}>
          <Table className="border-0">
            <THead>
              <tr>
                <TH>Date</TH>
                <TH>Title</TH>
                <TH>Course</TH>
                <TH>Topic</TH>
                <TH>Status</TH>
              </tr>
            </THead>
            <TBody>
              {plans.map((p) => (
                <TR key={p.id} data-testid="row" data-id={p.id}>
                  <TD className="whitespace-nowrap">{fmtDate(p.date)}</TD>
                  <TD>
                    <Link href={`/lesson-plans/${p.id}`} className="font-medium text-slate-900 hover:text-brand-700">
                      {p.title}
                    </Link>
                    {p.aiGenerated && <span className="ml-2 text-xs text-purple-700">AI draft</span>}
                  </TD>
                  <TD className="text-slate-500">
                    <Link href={`/classes/${p.courseId}/lesson-plans`} className="hover:text-brand-700">
                      {p.course.subject.name} · {p.course.class.name}
                    </Link>
                  </TD>
                  <TD className="text-slate-500">{p.curriculumTopic ?? "—"}</TD>
                  <TD>
                    <StatusBadge status={p.status} />
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </Card>
      )}
    </div>
  );
}
