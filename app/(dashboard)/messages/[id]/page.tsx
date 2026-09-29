import Link from "next/link";
import { requireCurrentUser } from "@/lib/auth/session";
import { getMessage } from "@/modules/communication";
import { Alert, Card, LinkButton, PageHeader } from "@/components/ui";
import { fmtDateTime, humanize } from "@/lib/format";
import { load, type IdParams } from "@/components/work/guard";

export const dynamic = "force-dynamic";

export default async function MessageDetailPage({ params }: { params: IdParams }) {
  const user = await requireCurrentUser();
  const { id } = await params;
  const result = await load(() => getMessage(user, id));
  if (result.error || !result.data) {
    return (
      <div>
        <PageHeader title="Message" breadcrumb={<Link href="/messages">← Messages</Link>} />
        <Alert tone="error">{result.error}</Alert>
      </div>
    );
  }
  const m = result.data;
  const threadId = m.threadId ?? m.id;
  const replyTo = m.senderUserId === user.id ? m.recipients.map((r) => r.userId) : [m.senderUserId];
  const replySubject = m.subject.startsWith("Re:") ? m.subject : `Re: ${m.subject}`;
  const replyHref = `/messages/new?threadId=${threadId}&to=${replyTo.join(",")}&subject=${encodeURIComponent(replySubject)}`;

  return (
    <div className="space-y-6">
      <PageHeader
        title={m.subject}
        breadcrumb={<Link href="/messages" className="hover:underline">← Messages</Link>}
        description={`From ${m.sender.name} (${humanize(m.sender.role)}) · ${fmtDateTime(m.createdAt)}`}
        actions={
          <LinkButton href={replyHref} data-testid="reply">
            Reply
          </LinkButton>
        }
      />

      {m.thread.length > 0 && (
        <Card title="Earlier in this thread" padded={false}>
          <ul className="divide-y divide-slate-100">
            {m.thread.map((t) => (
              <li key={t.id} className="px-4 py-3 text-sm" data-testid="thread-message" data-id={t.id}>
                <div className="flex items-center justify-between gap-2 text-xs text-slate-500">
                  <span>
                    <span className="font-medium text-slate-700">{t.sender.name}</span> · {fmtDateTime(t.createdAt)}
                  </span>
                  <Link href={`/messages/${t.id}`} className="hover:underline">
                    Open
                  </Link>
                </div>
                <p className="mt-1 whitespace-pre-wrap text-slate-700">{t.body}</p>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card title={m.sender.name} description={`To: ${m.recipients.map((r) => r.user.name).join(", ")}`}>
        <p className="whitespace-pre-wrap text-sm text-slate-800" data-testid="message-body">
          {m.body}
        </p>
      </Card>

      {m.senderUserId === user.id && (
        <Card title="Read receipts" padded={false}>
          <ul className="divide-y divide-slate-100 text-sm">
            {m.recipients.map((r) => (
              <li key={r.id} className="flex items-center justify-between px-4 py-2">
                <span>{r.user.name}</span>
                <span className="text-xs text-slate-500">{r.readAt ? `Read ${fmtDateTime(r.readAt)}` : "Unread"}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
