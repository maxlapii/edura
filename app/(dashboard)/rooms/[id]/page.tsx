import Link from "next/link";
import { requireCurrentUser } from "@/lib/auth/session";
import { hasPermission } from "@/lib/permissions";
import { getRoom } from "@/modules/facilities";
import { Alert, Badge, Card, DescriptionList, LinkButton, PageHeader } from "@/components/ui";
import { fmtDate, fmtLongDate, humanize } from "@/lib/format";
import { load, param, type IdParams, type SearchParams } from "@/components/work/guard";
import { ActionButton } from "@/components/work/action-button";
import { BookingForm } from "./booking-form";
import { EquipmentForm, EquipmentRow } from "./equipment-form";

export const dynamic = "force-dynamic";

export default async function RoomDetailPage({ params, searchParams }: { params: IdParams; searchParams: SearchParams }) {
  const user = await requireCurrentUser();
  const { id } = await params;
  const sp = await searchParams;
  const result = await load(() => getRoom(user, id));
  if (result.error || !result.data) {
    return (
      <div>
        <PageHeader title="Room" breadcrumb={<Link href="/rooms">← Rooms</Link>} />
        <Alert tone="error">{result.error}</Alert>
      </div>
    );
  }
  const room = result.data;
  const manager = hasPermission(user, "rooms:manage");
  const canBook = hasPermission(user, "rooms:book") && room.isActive;
  const dateParam = param(sp.date);

  return (
    <div className="space-y-6">
      <PageHeader
        title={room.name}
        breadcrumb={<Link href="/rooms" className="hover:underline">← Rooms</Link>}
        description={
          <span className="inline-flex items-center gap-2">
            <span className="font-mono text-xs">{room.code}</span>
            <Badge>{humanize(room.type)}</Badge>
            {!room.isActive && <Badge tone="red">Inactive</Badge>}
          </span>
        }
        actions={
          <>
            <LinkButton href={`/maintenance?roomId=${room.id}`} variant="outline">
              Report issue
            </LinkButton>
            {manager && (
              <LinkButton href={`/rooms/${room.id}/edit`} variant="outline" data-testid="edit-room">
                Edit
              </LinkButton>
            )}
          </>
        }
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card title="Details">
            <DescriptionList
              items={[
                { label: "Building", value: room.building ?? "—" },
                { label: "Capacity", value: room.capacity ?? "—" },
                { label: "Responsible", value: room.responsible?.name ?? "—" },
                { label: "Timetabled lessons / week", value: room._count.timetableSlots },
              ]}
            />
          </Card>

          <Card title={`Today's usage · ${fmtLongDate(new Date())}`} padded={false}>
            {room.todaySlots.length === 0 ? (
              <p className="px-4 py-3 text-sm text-slate-500">No lessons timetabled in this room today.</p>
            ) : (
              <ul className="divide-y divide-slate-100 text-sm">
                {room.todaySlots.map((s) => (
                  <li key={s.id} className="flex items-center gap-3 px-4 py-2" data-testid="slot" data-id={s.id}>
                    <span className="w-28 shrink-0 text-xs text-slate-500">
                      {s.period.name}
                      <div>
                        {s.period.startTime}–{s.period.endTime}
                      </div>
                    </span>
                    <span>
                      {s.course.subject.name} · {s.course.class.name}
                      <div className="text-xs text-slate-500">{s.teacher.user.name}</div>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          {canBook && (
            <Card title="Book room" description="Bookings are checked against the timetable and other confirmed bookings.">
              <BookingForm roomId={room.id} defaultDate={dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam) ? dateParam : undefined} />
            </Card>
          )}

          <Card title="Upcoming bookings" padded={false}>
            {room.upcomingBookings.length === 0 ? (
              <p className="px-4 py-3 text-sm text-slate-500">No upcoming bookings.</p>
            ) : (
              <ul className="divide-y divide-slate-100 text-sm">
                {room.upcomingBookings.map((b) => {
                  const own = b.bookedByUserId === user.id;
                  return (
                    <li key={b.id} className="flex items-center justify-between gap-3 px-4 py-2" data-testid="booking" data-id={b.id}>
                      <div>
                        <span className="font-medium text-slate-900">{fmtDate(b.date)}</span>{" "}
                        <span className="tabular-nums">
                          {b.startTime}–{b.endTime}
                        </span>
                        <div className="text-xs text-slate-500">
                          {b.purpose ?? "No purpose given"} · {own ? "You" : b.bookedBy.name}
                        </div>
                      </div>
                      {(own || manager) && <ActionButton method="DELETE" path={`/api/rooms/bookings/${b.id}`} label="Cancel" variant="ghost" confirmText="Cancel this booking?" testId="cancel-booking" />}
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
        </div>

        <Card title={`Equipment (${room.equipment.length})`} padded={false}>
          {room.equipment.length === 0 ? (
            <p className="px-4 py-3 text-sm text-slate-500">No equipment recorded.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {room.equipment.map((e) => (
                <EquipmentRow key={e.id} roomId={room.id} item={{ id: e.id, name: e.name, quantity: e.quantity, status: e.status, notes: e.notes }} canManage={manager} />
              ))}
            </ul>
          )}
          {manager && (
            <div className="border-t border-slate-100 p-3">
              <EquipmentForm roomId={room.id} />
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
