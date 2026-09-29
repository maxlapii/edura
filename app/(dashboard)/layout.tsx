import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { navForUser, quickActionsForUser } from "@/lib/nav";
import { countUnread } from "@/lib/notifications";
import { prisma } from "@/lib/db";
import { AppShell } from "@/components/layout/app-shell";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const [unread, school] = await Promise.all([countUnread(user.id), user.schoolId ? prisma.school.findUnique({ where: { id: user.schoolId }, select: { name: true } }) : null]);
  return (
    <AppShell user={{ name: user.name, email: user.email, role: user.role }} schoolName={school?.name ?? null} sections={navForUser(user)} quickActions={quickActionsForUser(user)} unread={unread}>
      {children}
    </AppShell>
  );
}
