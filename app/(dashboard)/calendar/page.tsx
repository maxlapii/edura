import Link from "next/link";
import { requireCurrentUser } from "@/lib/auth/session";
import { getCalendar, CALENDAR_KINDS, overlapsRange, type CalendarEntry, type CalendarKind } from "@/modules/calendar";
import { addDaysDateOnly, dayOfWeek, toDateOnly, todayDateOnly, formatDate } from "@/lib/utils/dates";
import { Alert, Card, EmptyState, LinkButton, PageHeader } from "@/components/ui";
import { DAY_SHORT, fmtTime, humanize } from "@/lib/format";
import { load, param, type SearchParams } from "@/components/work/guard";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

const KIND_STYLES: Record<CalendarKind, string> = {
  LESSON: "border-l-brand-500 bg-brand-50 text-brand-900",
  MEETING: "border-l-purple-500 bg-purple-50 text-purple-900",
  EVENT: "border-l-emerald-500 bg-emerald-50 text-emerald-900",
  ASSIGNMENT: "border-l-amber-500 bg-amber-50 text-amber-900",
  LEAVE: "border-l-red-500 bg-red-50 text-red-900",
  SUBSTITUTION: "border-l-orange-500 bg-orange-50 text-orange-900",
  HOLIDAY: "border-l-pink-500 bg-pink-50 text-pink-900",
  TERM: "border-l-slate-500 bg-slate-100 text-slate-800",
  EXAM: "border-l-rose-600 bg-rose-50 text-rose-900",
};
const KIND_DOTS: Record<CalendarKind, string> = {
  LESSON: "bg-brand-500", MEETING: "bg-purple-500", EVENT: "bg-emerald-500", ASSIGNMENT: "bg-amber-500", LEAVE: "bg-red-500", SUBSTITUTION: "bg-orange-500", HOLIDAY: "bg-pink-500", TERM: "bg-slate-500", EXAM: "bg-rose-600",
};

/** Lessons/substitutions are built in UTC from period times; everything else is a real timestamp. */
function entryTime(e: CalendarEntry): string {
  if (e.kind === "LESSON" || e.kind === "SUBSTITUTION") {
    const f = (d: Date) => `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
    return e.end ? `${f(e.start)}–${f(e.end)}` : f(e.start);
  }
  return e.end && e.kind !== "ASSIGNMENT" ? `${fmtTime(e.start)}–${fmtTime(e.end)}` : fmtTime(e.start);
}

function mondayOf(d: Date): Date {
  return addDaysDateOnly(d, -(dayOfWeek(d) - 1));
}

function EntryChip({ e }: { e: CalendarEntry }) {
  const body = (
    <div className={cn("rounded border-l-4 px-2 py-1 text-xs leading-tight", KIND_STYLES[e.kind])} data-testid="row" data-id={`${e.kind}:${e.id}`}>
      {!e.allDay && <div className="font-medium tabular-nums">{entryTime(e)}</div>}
      <div className={cn(e.allDay && "font-medium")}>{e.title}</div>
      {typeof e.meta.room === "string" && e.meta.room && <div className="text-[11px] opacity-75">{e.meta.room}</div>}
    </div>
  );
  return e.link ? (
    <Link href={e.link} className="block hover:opacity-90">
      {body}
    </Link>
  ) : (
    body
  );
}

export default async function CalendarPage({ searchParams }: { searchParams: SearchParams }) {
  const user = await requireCurrentUser();
  const sp = await searchParams;
  const today = todayDateOnly();
  const fromParam = param(sp.from);
  const from = fromParam && /^\d{4}-\d{2}-\d{2}$/.test(fromParam) ? mondayOf(toDateOnly(fromParam)) : mondayOf(today);
  const to = addDaysDateOnly(from, 6);
  const kindsParam = param(sp.kinds);
  const selected = (kindsParam ? kindsParam.split(",") : []).filter((k): k is CalendarKind => (CALENDAR_KINDS as readonly string[]).includes(k));

  const result = await load(() => getCalendar(user, { from, to, kinds: selected.length ? selected : undefined }));

  const hrefFor = (f: Date, kinds: CalendarKind[] = selected) => `/calendar?from=${formatDate(f)}${kinds.length ? `&kinds=${kinds.join(",")}` : ""}`;
  const toggleKind = (k: CalendarKind) => (selected.includes(k) ? selected.filter((x) => x !== k) : [...selected, k]);

  const days = Array.from({ length: 7 }, (_, i) => addDaysDateOnly(from, i));
  const allEntries = result.data ?? [];
  // Terms span months: show them once as a banner instead of repeating a chip on every day.
  const terms = allEntries.filter((e) => e.kind === "TERM");
  const entries = allEntries.filter((e) => e.kind !== "TERM");
  const byDay = days.map((day) => {
    const key = formatDate(day);
    const dayEnd = new Date(day.getTime() + 86_400_000 - 1);
    const allDay = entries.filter((e) => e.allDay && overlapsRange(toDateOnly(e.start), e.end ? toDateOnly(e.end) : null, day, day));
    const timed = entries.filter((e) => !e.allDay && e.start >= day && e.start <= dayEnd).sort((a, b) => a.start.getTime() - b.start.getTime());
    return { day, key, allDay, timed };
  });

  return (
    <div>
      <PageHeader
        title="Calendar"
        description={`Week of ${formatDate(from)} – ${formatDate(to)}`}
        actions={
          <>
            <LinkButton variant="outline" size="sm" href={hrefFor(addDaysDateOnly(from, -7))}>← Previous week</LinkButton>
            <LinkButton variant="outline" size="sm" href={hrefFor(mondayOf(today))}>This week</LinkButton>
            <LinkButton variant="outline" size="sm" href={hrefFor(addDaysDateOnly(from, 7))}>Next week →</LinkButton>
          </>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-2" aria-label="Filter by kind">
        {CALENDAR_KINDS.map((k) => {
          const active = selected.length === 0 || selected.includes(k);
          return (
            <Link key={k} href={hrefFor(from, toggleKind(k))} className={cn("inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium", active ? "border-slate-300 bg-white text-slate-800" : "border-slate-200 bg-slate-50 text-slate-400 line-through")} aria-pressed={selected.includes(k)}>
              <span className={cn("h-2 w-2 rounded-full", KIND_DOTS[k])} />
              {humanize(k)}
            </Link>
          );
        })}
        {selected.length > 0 && (
          <Link href={hrefFor(from, [])} className="text-xs text-brand-700 hover:underline">
            Show all
          </Link>
        )}
      </div>

      {result.error && <Alert tone="error">{result.error}</Alert>}

      {!result.error && terms.length > 0 && (
        <div className="mb-3 flex flex-wrap gap-2">
          {terms.map((t) => (
            <span key={t.id} className="inline-flex items-center gap-2 rounded-full bg-white px-3 py-1.5 text-xs text-ink shadow-card">
              <span className="h-2 w-2 rounded-full bg-slate-500" aria-hidden />
              <span className="font-medium">{t.title}</span>
              {t.end && <span className="text-muted">until {formatDate(t.end)}</span>}
            </span>
          ))}
        </div>
      )}

      {!result.error && entries.length === 0 && <EmptyState title="Nothing scheduled this week" description="Lessons, meetings, events, leave and deadlines will appear here." />}

      {!result.error && entries.length > 0 && (
        <>
          <div className="hidden grid-cols-7 gap-2 md:grid" data-testid="week-grid">
            {byDay.map(({ day, key, allDay, timed }) => {
              const isToday = key === formatDate(today);
              return (
                <div key={key} className={cn("min-h-[max(320px,calc(100dvh-340px))] rounded-2xl bg-white p-2.5 shadow-card", isToday && "ring-2 ring-brand-400", dayOfWeek(day) > 5 && "bg-white/70")}>
                  <div className="mb-2 flex items-baseline justify-between">
                    <span className="text-xs font-semibold uppercase text-slate-500">{DAY_SHORT[dayOfWeek(day)]}</span>
                    <span className={cn("text-sm font-semibold", isToday ? "text-brand-700" : "text-slate-800")}>{day.getUTCDate()}</span>
                  </div>
                  {allDay.length > 0 && (
                    <div className="mb-2 space-y-1 border-b border-dashed border-slate-200 pb-2">
                      {allDay.map((e) => <EntryChip key={`${e.kind}:${e.id}`} e={e} />)}
                    </div>
                  )}
                  <div className="space-y-1">
                    {timed.map((e) => <EntryChip key={`${e.kind}:${e.id}`} e={e} />)}
                    {allDay.length === 0 && timed.length === 0 && <p className="text-xs text-slate-400">—</p>}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="space-y-3 md:hidden" data-testid="agenda">
            {byDay.map(({ day, key, allDay, timed }) =>
              allDay.length + timed.length === 0 ? null : (
                <Card key={key} title={`${DAY_SHORT[dayOfWeek(day)]} ${formatDate(day)}`} padded={false}>
                  <ul className="divide-y divide-slate-100">
                    {[...allDay, ...timed].map((e) => (
                      <li key={`${e.kind}:${e.id}`} className="flex items-center gap-3 px-3 py-2 text-sm">
                        <span className={cn("h-2 w-2 shrink-0 rounded-full", KIND_DOTS[e.kind])} />
                        <span className="w-24 shrink-0 text-xs text-slate-500 tabular-nums">{e.allDay ? "All day" : entryTime(e)}</span>
                        {e.link ? <Link href={e.link} className="truncate hover:text-brand-700">{e.title}</Link> : <span className="truncate">{e.title}</span>}
                      </li>
                    ))}
                  </ul>
                </Card>
              ),
            )}
          </div>
        </>
      )}
    </div>
  );
}
