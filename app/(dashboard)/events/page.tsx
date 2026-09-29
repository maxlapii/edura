import Link from "next/link";
import { requireCurrentUser } from "@/lib/auth/session";
import { hasPermission } from "@/lib/permissions";
import { listEvents } from "@/modules/events";
import { Alert, Badge, EmptyState, LinkButton, PageHeader, StatusBadge, Table, TBody, TD, TH, THead, TR, Tabs } from "@/components/ui";
import { fmtDateTime, humanize } from "@/lib/format";
import { load, param, type SearchParams } from "@/components/work/guard";

export const dynamic = "force-dynamic";

const TYPE_TONES: Record<string, "gray" | "green" | "amber" | "red" | "blue" | "purple"> = {
  SCHOOL_EVENT: "blue", CLUB: "purple", COMPETITION: "amber", TRIP: "green", SPORTS: "green", ASSEMBLY: "blue", PARENT_EVENT: "purple", HOLIDAY: "gray", TRAINING: "amber", EXAM: "red", OTHER: "gray",
};

export default async function EventsPage({ searchParams }: { searchParams: SearchParams }) {
  const user = await requireCurrentUser();
  const sp = await searchParams;
  const view = param(sp.view) === "past" ? "past" : "upcoming";
  const now = new Date();
  const result = await load(() => listEvents(user, view === "past" ? { to: now } : { from: now }));
  const events = (result.data ?? []).filter((e) => (view === "past" ? e.endsAt < now : e.endsAt >= now));
  if (view === "past") events.reverse();

  return (
    <div>
      <PageHeader title="Events" description="School events, trips, clubs, exams and holidays." actions={hasPermission(user, "events:manage") && <LinkButton href="/events/new" data-testid="new-event">New event</LinkButton>} />
      <Tabs items={[{ href: "/events?view=upcoming", label: "Upcoming" }, { href: "/events?view=past", label: "Past" }]} current={`/events?view=${view}`} />
      {result.error && <Alert tone="error">{result.error}</Alert>}
      {!result.error && events.length === 0 && <EmptyState title={view === "past" ? "No past events" : "No upcoming events"} />}
      {!result.error && events.length > 0 && (
        <Table>
          <THead>
            <tr>
              <TH>When</TH>
              <TH>Event</TH>
              <TH>Type</TH>
              <TH>Location</TH>
              <TH>Audience</TH>
              <TH>Organizer</TH>
              <TH>Status</TH>
            </tr>
          </THead>
          <TBody>
            {events.map((e) => (
              <TR key={e.id} data-testid="row" data-id={e.id}>
                <TD className="whitespace-nowrap">
                  {fmtDateTime(e.startsAt)}
                  <div className="text-xs text-slate-500">to {fmtDateTime(e.endsAt)}</div>
                </TD>
                <TD>
                  <Link href={`/events/${e.id}`} className="font-medium text-slate-900 hover:text-brand-700">
                    {e.title}
                  </Link>
                </TD>
                <TD>
                  <Badge tone={TYPE_TONES[e.type] ?? "gray"}>{humanize(e.type)}</Badge>
                </TD>
                <TD>{e.location ?? "—"}</TD>
                <TD>{e.audience === "SCHOOL" ? "Entire school" : humanize(e.audience)}</TD>
                <TD>{e.organizer?.name ?? "—"}</TD>
                <TD>
                  <StatusBadge status={e.status} />
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      )}
    </div>
  );
}
