import Link from "next/link";
import { requireCurrentUser } from "@/lib/auth/session";
import { hasPermission } from "@/lib/permissions";
import { listMeetings } from "@/modules/meetings";
import { Alert, Badge, EmptyState, LinkButton, PageHeader, StatusBadge, Table, TBody, TD, TH, THead, TR, Tabs } from "@/components/ui";
import { fmtDateTime, fmtTime, humanize } from "@/lib/format";
import { load, param, type SearchParams } from "@/components/work/guard";

export const dynamic = "force-dynamic";

export default async function MeetingsPage({ searchParams }: { searchParams: SearchParams }) {
  const user = await requireCurrentUser();
  const sp = await searchParams;
  const view = param(sp.view) === "past" ? "past" : "upcoming";
  const now = new Date();
  const result = await load(() => listMeetings(user, view === "past" ? { to: now } : { from: now }));
  const meetings = (result.data ?? []).filter((m) => (view === "past" ? m.endsAt < now : m.endsAt >= now));
  if (view === "past") meetings.reverse();

  return (
    <div>
      <PageHeader title="Meetings" description="Staff, department, parent and management meetings you organize or are invited to." actions={hasPermission(user, "meetings:manage") && <LinkButton href="/meetings/new" data-testid="new-meeting">New meeting</LinkButton>} />
      <Tabs items={[{ href: "/meetings?view=upcoming", label: "Upcoming" }, { href: "/meetings?view=past", label: "Past" }]} current={`/meetings?view=${view}`} />
      {result.error && <Alert tone="error">{result.error}</Alert>}
      {!result.error && meetings.length === 0 && <EmptyState title={view === "past" ? "No past meetings" : "No upcoming meetings"} description="Meetings you organize or are invited to will appear here." />}
      {!result.error && meetings.length > 0 && (
        <Table>
          <THead>
            <tr>
              <TH>When</TH>
              <TH>Meeting</TH>
              <TH>Type</TH>
              <TH>Where</TH>
              <TH>Organizer</TH>
              <TH>Participants</TH>
              <TH>Status</TH>
            </tr>
          </THead>
          <TBody>
            {meetings.map((m) => {
              const mine = m.participants.find((p) => p.userId === user.id);
              return (
                <TR key={m.id} data-testid="row" data-id={m.id}>
                  <TD className="whitespace-nowrap">
                    {fmtDateTime(m.startsAt)} – {fmtTime(m.endsAt)}
                  </TD>
                  <TD>
                    <Link href={`/meetings/${m.id}`} className="font-medium text-slate-900 hover:text-brand-700">
                      {m.title}
                    </Link>
                    {mine && (
                      <span className="ml-2">
                        <StatusBadge status={mine.status} />
                      </span>
                    )}
                  </TD>
                  <TD>
                    <Badge tone="purple">{humanize(m.type)}</Badge>
                  </TD>
                  <TD>{m.room?.name ?? m.location ?? "—"}</TD>
                  <TD>{m.organizer.id === user.id ? "Me" : m.organizer.name}</TD>
                  <TD>{m.participants.length}</TD>
                  <TD>
                    <StatusBadge status={m.status} />
                  </TD>
                </TR>
              );
            })}
          </TBody>
        </Table>
      )}
    </div>
  );
}
