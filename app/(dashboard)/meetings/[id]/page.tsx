import Link from "next/link";
import { requireCurrentUser } from "@/lib/auth/session";
import { hasPermission, isAdmin } from "@/lib/permissions";
import { getMeeting } from "@/modules/meetings";
import { Alert, Badge, Card, DescriptionList, LinkButton, PageHeader, StatusBadge } from "@/components/ui";
import { fmtDate, fmtDateTime, fmtTime, humanize } from "@/lib/format";
import { load, type IdParams } from "@/components/work/guard";
import { staffUsers } from "@/components/work/lookups";
import { ActionButton } from "@/components/work/action-button";
import { CompleteMeetingForm } from "./complete-form";

export const dynamic = "force-dynamic";

export default async function MeetingDetailPage({ params }: { params: IdParams }) {
  const user = await requireCurrentUser();
  const { id } = await params;
  const result = await load(() => getMeeting(user, id));
  if (result.error || !result.data) {
    return (
      <div>
        <PageHeader title="Meeting" breadcrumb={<Link href="/meetings">← Meetings</Link>} />
        <Alert tone="error">{result.error}</Alert>
      </div>
    );
  }
  const m = result.data;
  const canManage = hasPermission(user, "meetings:manage") && (m.organizerUserId === user.id || isAdmin(user));
  const me = m.participants.find((p) => p.userId === user.id);
  const scheduled = m.status === "SCHEDULED";
  const users = canManage && scheduled ? await staffUsers(user.schoolId) : [];

  return (
    <div className="space-y-6">
      <PageHeader
        title={m.title}
        breadcrumb={<Link href="/meetings" className="hover:underline">← Meetings</Link>}
        description={
          <span className="inline-flex flex-wrap items-center gap-2">
            <Badge tone="purple">{humanize(m.type)}</Badge>
            <StatusBadge status={m.status} />
            <span>
              {fmtDateTime(m.startsAt)} – {fmtTime(m.endsAt)}
            </span>
          </span>
        }
        actions={
          <>
            {me && scheduled && (
              <>
                {me.status !== "ACCEPTED" && <ActionButton method="POST" path={`/api/meetings/${m.id}/respond`} json={{ status: "ACCEPTED" }} label="Accept" variant="primary" testId="rsvp-accept" />}
                {me.status !== "DECLINED" && <ActionButton method="POST" path={`/api/meetings/${m.id}/respond`} json={{ status: "DECLINED" }} label="Decline" variant="outline" testId="rsvp-decline" />}
              </>
            )}
            {canManage && scheduled && (
              <>
                <LinkButton href={`/meetings/${m.id}/edit`} variant="outline" data-testid="edit-meeting">
                  Edit
                </LinkButton>
                <ActionButton method="DELETE" path={`/api/meetings/${m.id}`} label="Cancel meeting" variant="danger" confirmText="Cancel this meeting? Participants will be notified." testId="cancel-meeting" />
              </>
            )}
          </>
        }
      />

      {me && scheduled && (
        <Alert tone={me.status === "ACCEPTED" ? "success" : me.status === "DECLINED" ? "warning" : "info"}>
          Your response: {humanize(me.status)}
        </Alert>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card title="Details">
            <DescriptionList
              items={[
                { label: "Organizer", value: m.organizer.name },
                { label: "Where", value: m.room ? `${m.room.name} (${m.room.code})` : (m.location ?? "—") },
                { label: "Starts", value: fmtDateTime(m.startsAt) },
                { label: "Ends", value: fmtDateTime(m.endsAt) },
              ]}
            />
          </Card>
          <Card title="Agenda">{m.agenda ? <p className="whitespace-pre-wrap text-sm text-slate-700">{m.agenda}</p> : <p className="text-sm text-slate-500">No agenda provided.</p>}</Card>

          {m.status === "COMPLETED" && (
            <>
              <Card title="Minutes">{m.minutes ? <p className="whitespace-pre-wrap text-sm text-slate-700">{m.minutes}</p> : <p className="text-sm text-slate-500">No minutes recorded.</p>}</Card>
              <Card title="Decisions">{m.decisions ? <p className="whitespace-pre-wrap text-sm text-slate-700">{m.decisions}</p> : <p className="text-sm text-slate-500">No decisions recorded.</p>}</Card>
            </>
          )}

          {(m.actionItems.length > 0 || m.status === "COMPLETED") && (
            <Card title="Action items" padded={false}>
              {m.actionItems.length === 0 ? (
                <p className="px-4 py-3 text-sm text-slate-500">No action items.</p>
              ) : (
                <ul className="divide-y divide-slate-100">
                  {m.actionItems.map((a) => (
                    <li key={a.id} className="flex items-center justify-between gap-3 px-4 py-2 text-sm" data-testid="action-item" data-id={a.id}>
                      <div>
                        <div className="text-slate-900">{a.description}</div>
                        <div className="text-xs text-slate-500">
                          {a.assignee ? a.assignee.name : "Unassigned"}
                          {a.dueDate && ` · due ${fmtDate(a.dueDate)}`}
                        </div>
                      </div>
                      {a.task ? (
                        <Link href={`/tasks/${a.task.id}`}>
                          <StatusBadge status={a.task.status} />
                        </Link>
                      ) : (
                        <StatusBadge status={a.done ? "DONE" : "TODO"} />
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          )}

          {canManage && scheduled && (
            <Card title="Complete meeting" description="Record minutes, decisions and action items. Action items with an assignee become tasks.">
              <CompleteMeetingForm meetingId={m.id} participants={m.participants.map((p) => ({ userId: p.userId, name: p.user.name, status: p.status }))} users={users} />
            </Card>
          )}
        </div>

        <Card title={`Participants (${m.participants.length})`} padded={false}>
          {m.participants.length === 0 ? (
            <p className="px-4 py-3 text-sm text-slate-500">No participants invited.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {m.participants.map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-2 px-4 py-2 text-sm" data-testid="participant" data-id={p.userId}>
                  <div>
                    <div className="text-slate-900">{p.user.name}</div>
                    <div className="text-xs text-slate-500">{humanize(p.user.role)}</div>
                  </div>
                  <StatusBadge status={p.status} />
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
