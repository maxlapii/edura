import { redirect } from "next/navigation";
import { requireCurrentUser } from "@/lib/auth/session";
import { dashboardForUser } from "@/modules/dashboards";
import { TeacherDashboard } from "@/components/dashboards/teacher";
import { AdminDashboard } from "@/components/dashboards/admin";
import { ParentDashboard, StaffDashboard, StudentDashboard } from "@/components/dashboards/student-parent";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const user = await requireCurrentUser();
  if (user.role === "SUPER_ADMIN" && !user.schoolId) redirect("/admin/schools");
  const result = await dashboardForUser(user);
  switch (result.kind) {
    case "admin":
      return <AdminDashboard data={result.data} name={user.name} />;
    case "principal":
      return <AdminDashboard data={result.data} principal name={user.name} />;
    case "teacher":
      return <TeacherDashboard data={result.data} name={user.name} />;
    case "student":
      return <StudentDashboard data={result.data} />;
    case "parent":
      return <ParentDashboard data={result.data} />;
    case "staff":
      return <StaffDashboard data={result.data} name={user.name} />;
  }
}
