import { redirect } from "next/navigation";
import { requireCurrentUser } from "@/lib/auth/session";
import { adminDashboard, principalDashboard } from "@/modules/dashboards";
import { AdminDashboard } from "@/components/dashboards/admin";
import { Alert } from "@/components/ui";
import { guarded } from "./_lib/guard";

export const dynamic = "force-dynamic";

export default async function AdminHomePage() {
  const user = await requireCurrentUser();
  if (user.role === "SUPER_ADMIN" && !user.schoolId) redirect("/admin/schools");
  if (user.role === "PRINCIPAL") {
    const res = await guarded(() => principalDashboard(user));
    if (!res.ok) return <Alert tone="error">{res.error}</Alert>;
    return <AdminDashboard data={res.data} principal name={user.name} />;
  }
  const res = await guarded(() => adminDashboard(user));
  if (!res.ok) return <Alert tone="error">{res.error}</Alert>;
  return <AdminDashboard data={res.data} name={user.name} />;
}
