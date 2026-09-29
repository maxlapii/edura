import { requireCurrentUser } from "@/lib/auth/session";
import { listCourses } from "@/modules/classes";
import { listPeriods, weeklySchedule } from "@/modules/timetable";
import { Alert, Button, Card, PageHeader, Select } from "@/components/ui";
import { ScheduleGrid } from "../_components/schedule-grid";
import { guarded, optional, str } from "../_lib/guard";
import { allTeacherOptions, classOptions, periodOptions, roomOptions } from "../_lib/options";
import type { PageProps } from "../_lib/types";
import { BulkSlotForm, SlotForm } from "./slot-form";

export const dynamic = "force-dynamic";

type View = "class" | "teacher" | "room";

export default async function TimetablePage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const user = await requireCurrentUser();
  const viewParam = str(sp, "view");
  const view: View = viewParam === "teacher" || viewParam === "room" ? viewParam : "class";
  const id = str(sp, "id");
  const [classes, teachers, rooms, periodOpts] = await Promise.all([classOptions(user), allTeacherOptions(user), roomOptions(user), periodOptions(user)]);
  const selectedId = id ?? (view === "class" ? classes[0]?.value : view === "teacher" ? teachers[0]?.value : rooms[0]?.value);
  const filter = selectedId ? { [`${view}Id`]: selectedId } : null;
  const res = await guarded(async () => {
    const [slots, periods, courses] = await Promise.all([filter ? weeklySchedule(user, filter) : Promise.resolve([]), listPeriods(user), optional(() => listCourses(user), [])]);
    return { slots, periods, courses };
  });
  if (!res.ok) return <Alert tone="error">{res.error}</Alert>;
  const { slots, periods, courses } = res.data;
  const options = view === "class" ? classes : view === "teacher" ? teachers : rooms;
  const selectedLabel = options.find((o) => o.value === selectedId)?.label;
  const courseOpts = courses.map((c) => ({ value: c.id, label: `${c.class.name} · ${c.subject.name} · ${c.teacher.user.name}`, classId: c.classId, teacherId: c.teacherId }));
  const relevantCourses = view === "class" ? courseOpts.filter((c) => c.classId === selectedId) : view === "teacher" ? courseOpts.filter((c) => c.teacherId === selectedId) : courseOpts;
  const show = view === "class" ? (["subject", "teacher", "room"] as const) : view === "teacher" ? (["subject", "class", "room"] as const) : (["subject", "class", "teacher"] as const);

  return (
    <div className="space-y-4">
      <PageHeader title="Timetable" description={selectedLabel ? `${view === "class" ? "Class" : view === "teacher" ? "Teacher" : "Room"}: ${selectedLabel}` : "Select a class, teacher or room."} />
      <div className="flex flex-wrap gap-3">
        {(
          [
            ["class", "Class", classes],
            ["teacher", "Teacher", teachers],
            ["room", "Room", rooms],
          ] as const
        ).map(([v, label, opts]) => (
          <form key={v} method="get" action="/admin/timetable" className={`flex items-end gap-2 rounded-md border p-2 ${view === v ? "border-brand-300 bg-brand-50" : "border-slate-200 bg-white"}`}>
            <input type="hidden" name="view" value={v} />
            <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
              {label}
              <Select name="id" defaultValue={view === v ? (selectedId ?? "") : ""} className="h-9 w-56">
                {opts.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </Select>
            </label>
            <Button type="submit" variant={view === v ? "primary" : "secondary"} size="md">
              Show
            </Button>
          </form>
        ))}
      </div>
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          {filter ? <ScheduleGrid slots={slots} periods={periods} show={[...show]} editable /> : <Alert tone="info">Nothing to show yet – create classes, teachers or rooms first.</Alert>}
          <p className="mt-2 text-xs text-slate-500">{slots.length} lessons per week. Conflicts (teacher, class or room double-booked) are rejected by the server when adding lessons.</p>
        </div>
        <div className="space-y-6">
          <Card title="Add lesson" description={view !== "room" && selectedId ? `Courses of the selected ${view} are listed first.` : undefined}>
            <SlotForm courses={[...relevantCourses, ...courseOpts.filter((c) => !relevantCourses.includes(c))]} periods={periodOpts} rooms={rooms} defaultCourseId={relevantCourses[0]?.value} />
          </Card>
          <Card title="Bulk add" description="Paste a JSON array of slots. All-or-nothing: any conflict rejects the whole batch.">
            <BulkSlotForm />
          </Card>
        </div>
      </div>
    </div>
  );
}
