import Link from "next/link";
import { requireCurrentUser } from "@/lib/auth/session";
import { hasPermission, isAdmin } from "@/lib/permissions";
import { prisma } from "@/lib/db";
import { getEvent } from "@/modules/events";
import { Alert, Badge, Card, DescriptionList, LinkButton, PageHeader, StatusBadge } from "@/components/ui";
import { fmtDateTime, humanize } from "@/lib/format";
import { load, type IdParams } from "@/components/work/guard";
import { staffUsers } from "@/components/work/lookups";
import { ActionButton } from "@/components/work/action-button";
import { AddParticipantsForm } from "./participants-form";

export const dynamic = "force-dynamic";

export default async function EventDetailPage({ params }: { params: IdParams }) {
  const user = await requireCurrentUser();
  const { id } = await params;
  const result = await load(() => getEvent(user, id));
  if (result.error || !result.data) {
    return (
      <div>
        <PageHeader title="Event" breadcrumb={<Link href="/events">← Events</Link>} />
        <Alert tone="error">{result.error}</Alert>
      </div>
    );
  }
  const e = result.data;
  const canManage = hasPermission(user, "events:manage") && (isAdmin(user) || (!!e.organizerUserId && e.organizerUserId === user.id));
  const active = e.status !== "CANCELLED" && e.status !== "COMPLETED";
  const [users, students] =
    canManage && active && user.schoolId
      ? await Promise.all([
          staffUsers(user.schoolId),
          prisma.student.findMany({ where: { schoolId: user.schoolId, status: "ACTIVE" }, select: { id: true, firstName: true, lastName: true, class: { select: { name: true } } }, orderBy: [{ class: { name: "asc" } }, { lastName: "asc" }] }),
        ])
      : [[], []];

  return (
    <div className="space-y-6">
      <PageHeader
        title={e.title}
        breadcrumb={<Link href="/events" className="hover:underline">← Events</Link>}
        description={
          <span className="inline-flex flex-wrap items-center gap-2">
            <Badge tone="blue">{humanize(e.type)}</Badge>
            <StatusBadge status={e.status} />
            <span>
              {fmtDateTime(e.startsAt)} – {fmtDateTime(e.endsAt)}
            </span>
          </span>
        }
        actions={
          canManage &&
          e.status !== "CANCELLED" && (
            <>
              <LinkButton href={`/events/${e.id}/edit`} variant="outline" data-testid="edit-event">
                Edit
              </LinkButton>
              {e.status === "SCHEDULED" && <ActionButton method="PATCH" path={`/api/events/${e.id}`} json={{ status: "COMPLETED" }} label="Mark completed" variant="outline" testId="complete-event" />}
              <ActionButton method="DELETE" path={`/api/events/${e.id}`} label="Cancel event" variant="danger" confirmText="Cancel this event?" testId="cancel-event" />
            </>
          )
        }
      />
      {e.status === "PENDING_APPROVAL" && <Alert tone="warning">This event is awaiting administrator approval.</Alert>}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card title="Details">
            <DescriptionList
              items={[
                { label: "Organizer", value: e.organizer?.name ?? "—" },
                { label: "Location", value: e.location ?? "—" },
                { label: "Audience", value: e.audience === "SCHOOL" ? "Entire school" : humanize(e.audience) },
                { label: "Requires approval", value: e.requiresApproval ? "Yes" : "No" },
              ]}
            />
            {e.description && <p className="mt-4 whitespace-pre-wrap text-sm text-slate-700">{e.description}</p>}
          </Card>
          {canManage && active && (
            <Card title="Add participants">
              <AddParticipantsForm eventId={e.id} users={users} students={students.map((s) => ({ id: s.id, name: `${s.firstName} ${s.lastName}`, className: s.class?.name ?? null }))} />
            </Card>
          )}
        </div>
        <Card title={`Participants (${e.participants.length})`} padded={false}>
          {e.participants.length === 0 ? (
            <p className="px-4 py-3 text-sm text-slate-500">No participants yet.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {e.participants.map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-2 px-4 py-2 text-sm" data-testid="participant" data-id={p.id}>
                  <div>
                    <div className="text-slate-900">{p.user ? p.user.name : p.student ? `${p.student.firstName} ${p.student.lastName}` : "—"}</div>
                    <div className="text-xs text-slate-500">{p.user ? humanize(p.user.role) : p.student ? `Student · ${p.student.studentNumber}` : ""}</div>
                  </div>
                  <Badge>{humanize(p.role)}</Badge>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
