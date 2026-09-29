import Link from "next/link";
import { requireCurrentUser } from "@/lib/auth/session";
import { hasPermission, isAdmin } from "@/lib/permissions";
import { Alert, Card, PageHeader } from "@/components/ui";
import { EventForm } from "../event-form";

export const dynamic = "force-dynamic";

export default async function NewEventPage() {
  const user = await requireCurrentUser();
  if (!hasPermission(user, "events:manage")) {
    return (
      <div>
        <PageHeader title="New event" breadcrumb={<Link href="/events">← Events</Link>} />
        <Alert tone="error">You do not have permission to create events.</Alert>
      </div>
    );
  }
  return (
    <div>
      <PageHeader title="New event" breadcrumb={<Link href="/events" className="hover:underline">← Events</Link>} description={isAdmin(user) ? "Scheduled events are visible to the selected audience immediately." : "Events that require approval are sent to an administrator before they are scheduled."} />
      <Card>
        <EventForm />
      </Card>
    </div>
  );
}
