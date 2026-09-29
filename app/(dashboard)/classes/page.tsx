import Link from "next/link";
import { requireCurrentUser } from "@/lib/auth/session";
import { listMyCourses } from "@/modules/classes";
import { EmptyState, PageHeader } from "@/components/ui";
import { ServiceError } from "../_components/service-error";
import { load } from "../_lib/load";

export const dynamic = "force-dynamic";

export default async function ClassesPage() {
  const user = await requireCurrentUser();
  const result = await load(() => listMyCourses(user));
  if (!result.ok) return <ServiceError error={result.error} />;
  const courses = result.data;
  const mine = courses.filter((c) => c.teacherId === user.teacherId);
  const others = courses.filter((c) => c.teacherId !== user.teacherId);

  return (
    <div>
      <PageHeader title="My classes" description={`${courses.length} course${courses.length === 1 ? "" : "s"}`} />
      {courses.length === 0 ? (
        <EmptyState title="No classes yet" description="Courses you teach will appear here once the timetable is set up." />
      ) : (
        <>
          <CourseCards courses={user.teacherId ? mine : courses} />
          {user.teacherId && others.length > 0 && (
            <>
              <h2 className="mb-2 mt-8 text-sm font-semibold text-slate-700">Homeroom & department classes</h2>
              <CourseCards courses={others} />
            </>
          )}
        </>
      )}
    </div>
  );
}

function CourseCards({ courses }: { courses: Awaited<ReturnType<typeof listMyCourses>> }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {courses.map((c) => (
        <Link key={c.id} href={`/classes/${c.id}`} data-testid="row" data-id={c.id} className="block rounded-card bg-white p-4 shadow-card transition hover:border-brand-300 hover:shadow">
          <div className="text-xs font-medium uppercase tracking-wide text-slate-500">{c.class.name}</div>
          <div className="mt-1 text-lg font-semibold text-slate-900">{c.subject.name}</div>
          {c.name && <div className="text-sm text-slate-600">{c.name}</div>}
          <div className="mt-2 text-xs text-slate-500">
            {c.class._count.students} students · {c.teacher.user.name}
          </div>
        </Link>
      ))}
    </div>
  );
}
