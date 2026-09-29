import Link from "next/link";
import type { getCourse } from "@/modules/classes";
import { PageHeader } from "@/components/ui";
import { DAY_SHORT } from "@/lib/format";
import { cn } from "@/lib/utils";

export type Course = Awaited<ReturnType<typeof getCourse>>;
export type CourseTab = "students" | "attendance" | "assignments" | "gradebook" | "lesson-plans" | "messages";

const TABS: Array<{ key: CourseTab; label: string; path: string }> = [
  { key: "students", label: "Students", path: "" },
  { key: "attendance", label: "Attendance", path: "/attendance" },
  { key: "assignments", label: "Assignments", path: "/assignments" },
  { key: "gradebook", label: "Gradebook", path: "/gradebook" },
  { key: "lesson-plans", label: "Lesson plans", path: "/lesson-plans" },
  { key: "messages", label: "Messages", path: "/messages" },
];

/** Class hub header: course title, teacher, timetable summary and the tab strip. */
export function CourseHub({ course, tab, actions }: { course: Course; tab: CourseTab; actions?: React.ReactNode }) {
  const base = `/classes/${course.id}`;
  const slots = [...course.timetableSlots].sort((a, b) => a.dayOfWeek - b.dayOfWeek || a.period.order - b.period.order);
  return (
    <div>
      <PageHeader
        title={`${course.subject.name} · ${course.class.name}`}
        breadcrumb={
          <Link href="/classes" className="hover:underline">
            My classes
          </Link>
        }
        description={
          <>
            {course.name ? `${course.name} · ` : ""}
            Teacher: {course.teacher.user.name}
            {slots.length > 0 && <> · {slots.map((s) => `${DAY_SHORT[s.dayOfWeek]} ${s.period.name}${s.room ? ` (${s.room.name})` : ""}`).join(", ")}</>}
          </>
        }
        actions={actions}
      />
      <nav className="scrollbar-none mb-5 inline-flex max-w-full gap-1 overflow-x-auto rounded-full bg-white p-1 shadow-card" aria-label="Class sections">
        {TABS.map((t) => {
          const active = t.key === tab;
          return (
            <Link key={t.key} href={`${base}${t.path}`} aria-current={active ? "page" : undefined} className={cn("inline-flex items-center whitespace-nowrap rounded-full px-4 py-1.5 text-sm font-medium transition", active ? "bg-ink text-white" : "text-slate-600 hover:bg-slate-100 hover:text-ink")}>
              {t.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
