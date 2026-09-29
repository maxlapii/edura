import Link from "next/link";
import { requireCurrentUser } from "@/lib/auth/session";
import { hasPermission } from "@/lib/permissions";
import { Alert, Card, PageHeader } from "@/components/ui";
import { classOptions, departmentOptions } from "@/components/work/lookups";
import { AnnouncementForm } from "../announcement-form";

export const dynamic = "force-dynamic";

export default async function NewAnnouncementPage() {
  const user = await requireCurrentUser();
  if (!hasPermission(user, "announcements:manage")) {
    return (
      <div>
        <PageHeader title="New announcement" breadcrumb={<Link href="/announcements">← Announcements</Link>} />
        <Alert tone="error">You do not have permission to publish announcements.</Alert>
      </div>
    );
  }
  const [departments, classes] = await Promise.all([departmentOptions(user.schoolId), classOptions(user.schoolId)]);
  const deptHead = user.role === "DEPARTMENT_HEAD";
  return (
    <div>
      <PageHeader title="New announcement" breadcrumb={<Link href="/announcements" className="hover:underline">← Announcements</Link>} description="Recipients are notified in-app when the announcement is published." />
      <Card>
        <AnnouncementForm departments={deptHead ? departments.filter((d) => d.id === user.departmentId) : departments} classes={classes} allowedAudiences={deptHead ? ["DEPARTMENT", "CLASS"] : undefined} />
      </Card>
    </div>
  );
}
