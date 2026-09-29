import Link from "next/link";
import { isEnabled } from "@/lib/features";
import { requireCurrentUser } from "@/lib/auth/session";
import { isStaffLike } from "@/lib/permissions";
import { listMessages } from "@/modules/communication";
import { Alert, EmptyState, LinkButton, PageHeader, Tabs } from "@/components/ui";
import { fmtDateTime } from "@/lib/format";
import { load, param, type SearchParams } from "@/components/work/guard";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function MessagesPage({ searchParams }: { searchParams: SearchParams }) {
  const user = await requireCurrentUser();
  const sp = await searchParams;
  const box = param(sp.box) === "sent" ? "sent" : "inbox";
  const result = await load(() => listMessages(user, { box }));
  const items = result.data ?? [];

  return (
    <div>
      <PageHeader
        title="Messages"
        description="Direct messages with teachers, parents, students and administrators."
        actions={
          <>
            {isStaffLike(user) && isEnabled("messageTemplates") && (
              <LinkButton href="/messages/templates" variant="outline">
                Templates
              </LinkButton>
            )}
            <LinkButton href="/messages/new" data-testid="new-message">
              New message
            </LinkButton>
          </>
        }
      />
      <Tabs items={[{ href: "/messages?box=inbox", label: "Inbox" }, { href: "/messages?box=sent", label: "Sent" }]} current={`/messages?box=${box}`} />
      {result.error && <Alert tone="error">{result.error}</Alert>}
      {!result.error && items.length === 0 && <EmptyState title={box === "sent" ? "No sent messages" : "Your inbox is empty"} />}
      {!result.error && items.length > 0 && (
        <ul className="divide-y divide-slate-100 rounded-card bg-white shadow-card">
          {items.map((m) => {
            const unread = box === "inbox" && "readAt" in m && !m.readAt;
            const counterpart = box === "sent" ? ("recipients" in m && Array.isArray(m.recipients) ? m.recipients.map((r) => r.user.name).slice(0, 3).join(", ") + (m._count.recipients > 3 ? ` +${m._count.recipients - 3}` : "") : `${m._count.recipients} recipients`) : m.sender.name;
            return (
              <li key={m.id} data-testid="row" data-id={m.id} className={cn("px-4 py-3", unread && "bg-brand-50/40")}>
                <Link href={`/messages/${m.id}`} className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      {unread && <span className="h-2 w-2 shrink-0 rounded-full bg-brand-600" aria-label="Unread" />}
                      <span className={cn("truncate text-sm", unread ? "font-semibold text-slate-900" : "text-slate-800")}>{m.subject}</span>
                      {m.threadId && <span className="text-xs text-slate-400">↩ reply</span>}
                    </div>
                    <p className="mt-0.5 text-xs text-slate-500">
                      {box === "sent" ? "To" : "From"} {counterpart}
                    </p>
                    <p className="mt-0.5 line-clamp-1 text-xs text-slate-500">{m.body}</p>
                  </div>
                  <span className="shrink-0 text-xs text-slate-400">{fmtDateTime(m.createdAt)}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
