import Link from "next/link";
import { requireCurrentUser } from "@/lib/auth/session";
import { hasPermission } from "@/lib/permissions";
import { getRoom } from "@/modules/facilities";
import { Alert, Card, PageHeader } from "@/components/ui";
import { load, type IdParams } from "@/components/work/guard";
import { staffUsers } from "@/components/work/lookups";
import { RoomForm } from "../../room-form";

export const dynamic = "force-dynamic";

export default async function EditRoomPage({ params }: { params: IdParams }) {
  const user = await requireCurrentUser();
  const { id } = await params;
  const manager = hasPermission(user, "rooms:manage");
  const result = await load(() => getRoom(user, id));
  const room = result.data;
  const users = manager ? await staffUsers(user.schoolId) : [];
  return (
    <div>
      <PageHeader title={room ? `Edit ${room.name}` : "Edit room"} breadcrumb={<Link href={`/rooms/${id}`} className="hover:underline">← Back to room</Link>} />
      {result.error && <Alert tone="error">{result.error}</Alert>}
      {room && !manager && <Alert tone="error">You do not have permission to edit rooms.</Alert>}
      {room && manager && (
        <Card>
          <RoomForm initial={{ id: room.id, name: room.name, code: room.code, type: room.type, capacity: room.capacity, building: room.building, responsibleUserId: room.responsibleUserId, isActive: room.isActive }} users={users} />
        </Card>
      )}
    </div>
  );
}
