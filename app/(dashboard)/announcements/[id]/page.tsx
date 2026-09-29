import Link from "next/link";
import { requireCurrentUser } from "@/lib/auth/session";
import { hasPermission, isAdmin } from "@/lib/permissions";
import { announcementReadStats, getAnnouncement } from "@/modules/announcements";
import { Alert, Badge, Card, DescriptionList, LinkButton, PageHeader, StatusBadge } from "@/components/ui";
import { fmtDateTime, humanize } from "@/lib/format";
import { load, optional, type IdParams } from "@/components/work/guard";
import { ActionButton } from "@/components/work/action-button";
import { MarkAnnouncementRead } from "./mark-read";

export const dynamic = "force-dynamic";

export default async function AnnouncementDetailPage({ params }: { params: IdParams }) {
  const user = await requireCurrentUser();
  const { id } = await params;
  const result = await load(() => getAnnouncement(user, id));
  if (result.error || !result.data) {
    return (
      <div>
        <PageHeader title="Announcement" breadcrumb={<Link href="/announcements">← Announcements</Link>} />
        <Alert tone="error">{result.error}</Alert>
      </div>
    );
  }
  const a = result.data;
  const manager = hasPermission(user, "announcements:manage");
  const canEdit = manager && (a.authorUserId === user.id || isAdmin(user));
  const stats = manager ? await optional(() => announcementReadStats(user, id)) : null;
  const attachments = Array.isArray(a.attachments) ? (a.attachments as Array<{ name: string; url: string }>) : [];

  return (
    <div className="space-y-6">
      {!a.read && <MarkAnnouncementRead id={a.id} />}
      <PageHeader
        title={a.title}
        breadcrumb={<Link href="/announcements" className="hover:underline">← Announcements</Link>}
        description={
          <span className="inline-flex flex-wrap items-center gap-2">
            <StatusBadge status={a.priority} />
            <Badge tone="blue">{a.audience === "SCHOOL" ? "Entire school" : humanize(a.audience)}</Badge>
            <span>
              {a.author.name} · {fmtDateTime(a.publishAt)}
            </span>
          </span>
        }
        actions={
          canEdit && (
            <>
              <LinkButton href={`/announcements/${a.id}/edit`} variant="outline" data-testid="edit-announcement">
                Edit
              </LinkButton>
              <ActionButton method="DELETE" path={`/api/announcements/${a.id}`} label="Delete" variant="danger" confirmText="Delete this announcement?" redirectTo="/announcements" testId="delete-announcement" />
            </>
          )
        }
      />
      <Card>
        <p className="whitespace-pre-wrap text-sm text-slate-800" data-testid="announcement-body">
          {a.body}
        </p>
        {attachments.length > 0 && (
          <ul className="mt-4 space-y-1 text-sm">
            {attachments.map((f, i) => (
              <li key={i}>
                <a href={f.url} className="text-brand-700 hover:underline" target="_blank" rel="noreferrer">
                  {f.name}
                </a>
              </li>
            ))}
          </ul>
        )}
      </Card>
      {manager && (
        <Card title="Publishing">
          <DescriptionList
            items={[
              { label: "Published", value: fmtDateTime(a.publishAt) },
              { label: "Expires", value: a.expiresAt ? fmtDateTime(a.expiresAt) : "Never" },
              { label: "Read by", value: stats ? `${stats.readCount} of ${stats.recipientCount}${stats.readRate !== null ? ` (${stats.readRate}%)` : ""}` : (a.readCount ?? 0) },
            ]}
          />
          {stats && stats.readers.length > 0 && (
            <details className="mt-3 text-sm">
              <summary className="cursor-pointer text-slate-600">Readers</summary>
              <ul className="mt-2 divide-y divide-slate-100 rounded border border-slate-200">
                {stats.readers.map((r) => (
                  <li key={r.userId} className="flex items-center justify-between px-3 py-1.5">
                    <span>
                      {r.name} <span className="text-xs text-slate-500">· {humanize(r.role)}</span>
                    </span>
                    <span className="text-xs text-slate-500">{fmtDateTime(r.readAt)}</span>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </Card>
      )}
    </div>
  );
}
