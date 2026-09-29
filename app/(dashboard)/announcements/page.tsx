import Link from "next/link";
import { requireCurrentUser } from "@/lib/auth/session";
import { hasPermission } from "@/lib/permissions";
import { listAnnouncementsForUser } from "@/modules/announcements";
import { Alert, Badge, EmptyState, LinkButton, PageHeader, StatusBadge } from "@/components/ui";
import { fmtDateTime, humanize } from "@/lib/format";
import { load } from "@/components/work/guard";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function AnnouncementsPage() {
  const user = await requireCurrentUser();
  const manager = hasPermission(user, "announcements:manage");
  const result = await load(() => listAnnouncementsForUser(user));
  const items = result.data ?? [];
  const now = new Date();
  const unread = items.filter((a) => !a.read).length;

  return (
    <div>
      <PageHeader title="Announcements" description={unread ? `${unread} unread` : "School, department and class announcements."} actions={manager && <LinkButton href="/announcements/new" data-testid="new-announcement">New announcement</LinkButton>} />
      {result.error && <Alert tone="error">{result.error}</Alert>}
      {!result.error && items.length === 0 && <EmptyState title="No announcements" description="Announcements addressed to you will appear here." />}
      {!result.error && items.length > 0 && (
        <ul className="divide-y divide-slate-100 rounded-card bg-white shadow-card">
          {items.map((a) => {
            const scheduled = a.publishAt > now;
            const expired = !!a.expiresAt && a.expiresAt < now;
            return (
              <li key={a.id} data-testid="row" data-id={a.id} className={cn("px-4 py-3", !a.read && "bg-brand-50/40")}>
                <Link href={`/announcements/${a.id}`} className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      {!a.read && <span className="h-2 w-2 shrink-0 rounded-full bg-brand-600" aria-label="Unread" />}
                      <span className={cn("text-sm", !a.read ? "font-semibold text-slate-900" : "text-slate-800")}>{a.title}</span>
                      {(a.priority === "HIGH" || a.priority === "URGENT") && <StatusBadge status={a.priority} />}
                      <Badge tone="blue">{a.audience === "SCHOOL" ? "Entire school" : humanize(a.audience)}</Badge>
                      {manager && scheduled && <Badge tone="amber">Scheduled</Badge>}
                      {manager && expired && <Badge tone="gray">Expired</Badge>}
                    </div>
                    <p className="mt-0.5 line-clamp-2 text-xs text-slate-600">{a.body}</p>
                    <p className="mt-0.5 text-xs text-slate-400">
                      {a.author.name} · {fmtDateTime(a.publishAt)}
                      {manager && a.readCount !== undefined && ` · ${a.readCount} read`}
                    </p>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
