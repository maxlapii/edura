import Link from "next/link";
import { requireCurrentUser } from "@/lib/auth/session";
import { listNotifications } from "@/lib/notifications";
import { Card, EmptyState, PageHeader } from "@/components/ui";
import { fmtDateTime, humanize } from "@/lib/format";
import { MarkAllReadButton, MarkReadButton } from "./notification-actions";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

type Notification = Awaited<ReturnType<typeof listNotifications>>[number];

function NotificationList({ items, unread }: { items: Notification[]; unread: boolean }) {
  return (
    <ul className="divide-y divide-slate-100">
      {items.map((n) => (
        <li key={n.id} data-testid="notification" data-type={n.type} data-id={n.id} className={cn("flex items-start justify-between gap-3 px-4 py-3", unread && "bg-brand-50/40")}>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              {unread && <span className="h-2 w-2 shrink-0 rounded-full bg-brand-600" aria-label="Unread" />}
              {n.link ? (
                <Link href={n.link} className={cn("truncate text-sm hover:text-brand-700", unread ? "font-semibold text-slate-900" : "text-slate-800")}>
                  {n.title}
                </Link>
              ) : (
                <span className={cn("truncate text-sm", unread ? "font-semibold text-slate-900" : "text-slate-800")}>{n.title}</span>
              )}
            </div>
            {n.body && <p className="mt-0.5 line-clamp-2 text-xs text-slate-600">{n.body}</p>}
            <p className="mt-0.5 text-xs text-slate-400">
              {humanize(n.type)} · {fmtDateTime(n.createdAt)}
            </p>
          </div>
          {unread && <MarkReadButton id={n.id} />}
        </li>
      ))}
    </ul>
  );
}

export default async function NotificationsPage() {
  const user = await requireCurrentUser();
  const items = await listNotifications(user.id, { take: 100 });
  const unread = items.filter((n) => !n.readAt);
  const earlier = items.filter((n) => !!n.readAt);

  return (
    <div>
      <PageHeader title="Notifications" description={unread.length ? `${unread.length} unread` : "You're all caught up"} actions={unread.length > 0 && <MarkAllReadButton />} />
      {items.length === 0 ? (
        <EmptyState title="No notifications yet" description="Leave decisions, assigned tasks, messages and reminders will show up here." />
      ) : (
        <div className="space-y-6">
          <Card title={`Unread (${unread.length})`} padded={false}>
            {unread.length === 0 ? <p className="px-4 py-3 text-sm text-slate-500">No unread notifications.</p> : <NotificationList items={unread} unread />}
          </Card>
          <Card title="Earlier" padded={false}>
            {earlier.length === 0 ? <p className="px-4 py-3 text-sm text-slate-500">Nothing here yet.</p> : <NotificationList items={earlier} unread={false} />}
          </Card>
        </div>
      )}
    </div>
  );
}
