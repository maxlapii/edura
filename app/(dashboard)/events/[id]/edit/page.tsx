import Link from "next/link";
import { requireCurrentUser } from "@/lib/auth/session";
import { hasPermission, isAdmin } from "@/lib/permissions";
import { getEvent } from "@/modules/events";
import { Alert, Card, PageHeader } from "@/components/ui";
import { load, type IdParams } from "@/components/work/guard";
import { EventForm } from "../../event-form";

export const dynamic = "force-dynamic";

export default async function EditEventPage({ params }: { params: IdParams }) {
  const user = await requireCurrentUser();
  const { id } = await params;
  const result = await load(() => getEvent(user, id));
  const e = result.data;
  const canManage = !!e && hasPermission(user, "events:manage") && (isAdmin(user) || (!!e.organizerUserId && e.organizerUserId === user.id));
  return (
    <div>
      <PageHeader title="Edit event" breadcrumb={<Link href={`/events/${id}`} className="hover:underline">← Back to event</Link>} />
      {result.error && <Alert tone="error">{result.error}</Alert>}
      {e && !canManage && <Alert tone="error">Only the organizer or an administrator can edit this event.</Alert>}
      {e && canManage && e.status === "CANCELLED" && <Alert tone="warning">This event is cancelled and can no longer be edited.</Alert>}
      {e && canManage && e.status !== "CANCELLED" && (
        <Card>
          <EventForm initial={{ id: e.id, title: e.title, type: e.type, description: e.description, startsAt: e.startsAt, endsAt: e.endsAt, location: e.location, audience: e.audience, requiresApproval: e.requiresApproval }} />
        </Card>
      )}
    </div>
  );
}
