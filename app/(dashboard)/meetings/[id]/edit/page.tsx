import Link from "next/link";
import { requireCurrentUser } from "@/lib/auth/session";
import { hasPermission, isAdmin } from "@/lib/permissions";
import { getMeeting } from "@/modules/meetings";
import { Alert, Card, PageHeader } from "@/components/ui";
import { load, type IdParams } from "@/components/work/guard";
import { roomOptions, staffUsers } from "@/components/work/lookups";
import { MeetingForm } from "../../meeting-form";

export const dynamic = "force-dynamic";

export default async function EditMeetingPage({ params }: { params: IdParams }) {
  const user = await requireCurrentUser();
  const { id } = await params;
  const result = await load(() => getMeeting(user, id));
  const meeting = result.data;
  const canManage = !!meeting && hasPermission(user, "meetings:manage") && (meeting.organizerUserId === user.id || isAdmin(user));
  const [rooms, users] = canManage ? await Promise.all([roomOptions(user.schoolId), staffUsers(user.schoolId)]) : [[], []];
  return (
    <div>
      <PageHeader title="Edit meeting" breadcrumb={<Link href={`/meetings/${id}`} className="hover:underline">← Back to meeting</Link>} />
      {result.error && <Alert tone="error">{result.error}</Alert>}
      {meeting && !canManage && <Alert tone="error">Only the organizer or an administrator can edit this meeting.</Alert>}
      {meeting && canManage && meeting.status !== "SCHEDULED" && <Alert tone="warning">This meeting is {meeting.status.toLowerCase()} and can no longer be edited.</Alert>}
      {meeting && canManage && meeting.status === "SCHEDULED" && (
        <Card>
          <MeetingForm
            initial={{ id: meeting.id, title: meeting.title, type: meeting.type, startsAt: meeting.startsAt, endsAt: meeting.endsAt, roomId: meeting.roomId, location: meeting.location, agenda: meeting.agenda, participantUserIds: meeting.participants.map((p) => p.userId) }}
            rooms={rooms}
            users={users}
            currentUserId={user.id}
          />
        </Card>
      )}
    </div>
  );
}
