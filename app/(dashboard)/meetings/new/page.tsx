import Link from "next/link";
import { requireCurrentUser } from "@/lib/auth/session";
import { hasPermission } from "@/lib/permissions";
import { Alert, Card, PageHeader } from "@/components/ui";
import { roomOptions, staffUsers } from "@/components/work/lookups";
import { MeetingForm } from "../meeting-form";

export const dynamic = "force-dynamic";

export default async function NewMeetingPage() {
  const user = await requireCurrentUser();
  if (!hasPermission(user, "meetings:manage")) {
    return (
      <div>
        <PageHeader title="New meeting" breadcrumb={<Link href="/meetings">← Meetings</Link>} />
        <Alert tone="error">You do not have permission to create meetings.</Alert>
      </div>
    );
  }
  const [rooms, users] = await Promise.all([roomOptions(user.schoolId), staffUsers(user.schoolId)]);
  return (
    <div>
      <PageHeader title="New meeting" breadcrumb={<Link href="/meetings" className="hover:underline">← Meetings</Link>} description="Invited participants are notified and can accept or decline." />
      <Card>
        <MeetingForm rooms={rooms} users={users} currentUserId={user.id} />
      </Card>
    </div>
  );
}
