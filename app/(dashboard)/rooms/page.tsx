import Link from "next/link";
import { requireCurrentUser } from "@/lib/auth/session";
import { hasPermission } from "@/lib/permissions";
import { listRooms, roomAvailability } from "@/modules/facilities";
import { addDaysDateOnly, formatDate, toDateOnly, todayDateOnly } from "@/lib/utils/dates";
import { Alert, Badge, Card, EmptyState, LinkButton, PageHeader, Table, TBody, TD, TH, THead, TR } from "@/components/ui";
import { DAY_NAMES, humanize } from "@/lib/format";
import { load, param, type SearchParams } from "@/components/work/guard";
import { staffUsers } from "@/components/work/lookups";
import { cn } from "@/lib/utils";
import { NewRoomPanel } from "./room-form";

export const dynamic = "force-dynamic";

export default async function RoomsPage({ searchParams }: { searchParams: SearchParams }) {
  const user = await requireCurrentUser();
  const sp = await searchParams;
  const dateParam = param(sp.date);
  const date = dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam) ? toDateOnly(dateParam) : todayDateOnly();
  const manager = hasPermission(user, "rooms:manage");

  const [roomsResult, availability, users] = await Promise.all([load(() => listRooms(user)), load(() => roomAvailability(user, { date })), manager ? staffUsers(user.schoolId) : Promise.resolve([])]);
  const rooms = roomsResult.data ?? [];
  const av = availability.data;
  const dateHref = (d: Date) => `/rooms?date=${formatDate(d)}`;

  return (
    <div className="space-y-6">
      <PageHeader title="Rooms" description="Classrooms, labs, meeting rooms and their availability." actions={manager && <NewRoomPanel users={users} />} />

      {roomsResult.error && <Alert tone="error">{roomsResult.error}</Alert>}
      {!roomsResult.error && rooms.length === 0 && <EmptyState title="No rooms yet" description={manager ? "Create the first room to start booking." : "Rooms will appear here once they are set up."} />}
      {!roomsResult.error && rooms.length > 0 && (
        <Table>
          <THead>
            <tr>
              <TH>Room</TH>
              <TH>Code</TH>
              <TH>Type</TH>
              <TH>Building</TH>
              <TH>Capacity</TH>
              <TH>Responsible</TH>
              <TH>Lessons/wk</TH>
              <TH>Status</TH>
            </tr>
          </THead>
          <TBody>
            {rooms.map((r) => (
              <TR key={r.id} data-testid="row" data-id={r.id}>
                <TD>
                  <Link href={`/rooms/${r.id}`} className="font-medium text-slate-900 hover:text-brand-700">
                    {r.name}
                  </Link>
                </TD>
                <TD className="font-mono text-xs">{r.code}</TD>
                <TD>{humanize(r.type)}</TD>
                <TD>{r.building ?? "—"}</TD>
                <TD>{r.capacity ?? "—"}</TD>
                <TD>{r.responsible?.name ?? "—"}</TD>
                <TD>{r._count.timetableSlots}</TD>
                <TD>{r.isActive ? <Badge tone="green">Active</Badge> : <Badge>Inactive</Badge>}</TD>
              </TR>
            ))}
          </TBody>
        </Table>
      )}

      <Card
        title={`Availability · ${DAY_NAMES[av?.dayOfWeek ?? 1]} ${formatDate(date)}`}
        description="Green = free for the period (no lesson, no confirmed booking)."
        actions={
          <>
            <LinkButton href={dateHref(addDaysDateOnly(date, -1))} variant="outline" size="sm">← Prev</LinkButton>
            <LinkButton href={dateHref(todayDateOnly())} variant="outline" size="sm">Today</LinkButton>
            <LinkButton href={dateHref(addDaysDateOnly(date, 1))} variant="outline" size="sm">Next →</LinkButton>
          </>
        }
        padded={false}
      >
        {availability.error && <div className="p-4"><Alert tone="error">{availability.error}</Alert></div>}
        {av && av.periods.length === 0 && <p className="px-4 py-3 text-sm text-slate-500">No periods configured yet.</p>}
        {av && av.periods.length > 0 && (
          <div className="overflow-x-auto">
            <table className="min-w-full text-xs" data-testid="availability-grid">
              <thead className="bg-slate-50 text-slate-500">
                <tr>
                  <th className="px-3 py-2 text-left font-semibold">Room</th>
                  {av.periods.map((p) => (
                    <th key={p.id} className="px-2 py-2 text-center font-semibold" title={`${p.startTime}–${p.endTime}`}>
                      {p.name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {av.rooms.map(({ room, free }) => (
                  <tr key={room.id} data-testid="availability-row" data-id={room.id}>
                    <td className="whitespace-nowrap px-3 py-1.5">
                      <Link href={`/rooms/${room.id}?date=${formatDate(date)}`} className="hover:text-brand-700">
                        {room.name}
                      </Link>
                    </td>
                    {av.periods.map((p) => {
                      const isFree = free.includes(p.id);
                      return (
                        <td key={p.id} className="px-2 py-1.5 text-center">
                          <span className={cn("inline-block h-4 w-8 rounded", isFree ? "bg-emerald-200" : "bg-slate-200")} title={isFree ? "Free" : "Occupied"} aria-label={isFree ? "Free" : "Occupied"} />
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
