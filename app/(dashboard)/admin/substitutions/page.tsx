import Link from "next/link";
import { requireCurrentUser } from "@/lib/auth/session";
import { listSubstitutions } from "@/modules/substitution";
import { weeklySchedule } from "@/modules/timetable";
import { Alert, LinkButton, PageHeader, StatusBadge, Table, TBody, TD, TH, THead, TR } from "@/components/ui";
import { DAY_SHORT, fmtDate } from "@/lib/format";
import { EntityForm } from "../_components/entity-form";
import { FilterBar, FilterField, FilterInput, FilterSelect } from "../_components/filter-bar";
import { dateParam, guarded, optional, str } from "../_lib/guard";
import { enumOptions } from "../_lib/options";
import type { PageProps } from "../_lib/types";
import { CreatePanel } from "@/app/(dashboard)/_components/create-panel";

export const dynamic = "force-dynamic";

const STATUSES = ["PENDING", "ASSIGNED", "DECLINED", "COMPLETED", "CANCELLED"] as const;
const ORDER: Record<string, number> = { PENDING: 0, DECLINED: 1, ASSIGNED: 2, COMPLETED: 3, CANCELLED: 4 };

export default async function SubstitutionsPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const user = await requireCurrentUser();
  const status = str(sp, "status");
  const from = dateParam(sp, "from");
  const to = dateParam(sp, "to");
  const res = await guarded(() => listSubstitutions(user, { status, from, to }));
  if (!res.ok) return <Alert tone="error">{res.error}</Alert>;
  const items = [...res.data].sort((a, b) => (ORDER[a.status] ?? 9) - (ORDER[b.status] ?? 9) || a.date.getTime() - b.date.getTime());
  const slots = await optional(() => weeklySchedule(user, {}), []);
  const slotOptions = slots.map((s) => ({ value: s.id, label: `${DAY_SHORT[s.dayOfWeek]} ${s.period.name} · ${s.course.subject.name} ${s.course.class.name} · ${s.course.teacher.user.name}` }));
  return (
    <div className="space-y-4">
      <PageHeader title="Substitutions" description="Lessons that need cover and who is covering them." />
      <FilterBar action="/admin/substitutions">
        <FilterField label="Status">
          <FilterSelect name="status" defaultValue={status ?? ""} options={enumOptions(STATUSES)} />
        </FilterField>
        <FilterField label="From">
          <FilterInput name="from" type="date" defaultValue={str(sp, "from")} />
        </FilterField>
        <FilterField label="To">
          <FilterInput name="to" type="date" defaultValue={str(sp, "to")} />
        </FilterField>
      </FilterBar>
      <div className="flex flex-col gap-4">
        <div className="min-w-0">
          <Table>
            <THead>
              <TR>
                <TH>Date</TH>
                <TH>Lesson</TH>
                <TH>Absent teacher</TH>
                <TH>Substitute</TH>
                <TH>Status</TH>
                <TH className="text-right">Actions</TH>
              </TR>
            </THead>
            <TBody>
              {items.map((s) => (
                <TR key={s.id} data-testid="row" data-id={s.id} data-status={s.status}>
                  <TD>
                    {fmtDate(s.date)}
                    <div className="text-xs text-slate-500">{s.timetableSlot.period.name}</div>
                  </TD>
                  <TD>
                    {s.timetableSlot.course.subject.name} · {s.timetableSlot.course.class.name}
                    <div className="text-xs text-slate-500">{s.timetableSlot.room?.name ?? "No room"}</div>
                  </TD>
                  <TD>{s.absentTeacher.user.name}</TD>
                  <TD>{s.substituteTeacher?.user.name ?? <span className="text-slate-400">—</span>}</TD>
                  <TD>
                    <StatusBadge status={s.status} />
                  </TD>
                  <TD className="text-right">
                    <LinkButton href={`/admin/substitutions/${s.id}`} size="sm" variant={s.status === "PENDING" ? "primary" : "outline"}>
                      {s.status === "PENDING" ? "Find substitute" : "Details"}
                    </LinkButton>
                  </TD>
                </TR>
              ))}
              {items.length === 0 && (
                <TR>
                  <TD colSpan={6} className="text-center text-slate-500">
                    No substitutions match the filter.
                  </TD>
                </TR>
              )}
            </TBody>
          </Table>
        </div>
        <CreatePanel className="order-first" title="Create substitution need" description="For an absence without a leave request (e.g. same-day sickness).">
          <EntityForm
            testId="substitution-form"
            action="/api/substitutions"
            submitLabel="Create need"
            redirectTo="/admin/substitutions/{id}"
            columns={3}
            compact
            fields={[
              { name: "timetableSlotId", label: "Lesson", type: "select", options: slotOptions, required: true, placeholder: "Select a lesson…" },
              { name: "date", label: "Date", type: "date", required: true },
              { name: "note", label: "Note", type: "textarea", rows: 2 },
            ]}
          />
        </CreatePanel>
      </div>
      <p className="text-xs text-slate-500">
        Substitutions are usually created automatically when <Link href="/admin/leave" className="text-brand-700 hover:underline">leave</Link> is approved.
      </p>
    </div>
  );
}
