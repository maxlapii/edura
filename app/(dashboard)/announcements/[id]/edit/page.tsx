import Link from "next/link";
import { requireCurrentUser } from "@/lib/auth/session";
import { hasPermission, isAdmin } from "@/lib/permissions";
import { getAnnouncement } from "@/modules/announcements";
import { Alert, Card, PageHeader } from "@/components/ui";
import { load, type IdParams } from "@/components/work/guard";
import { classOptions, departmentOptions } from "@/components/work/lookups";
import { AnnouncementForm } from "../../announcement-form";

export const dynamic = "force-dynamic";

export default async function EditAnnouncementPage({ params }: { params: IdParams }) {
  const user = await requireCurrentUser();
  const { id } = await params;
  const result = await load(() => getAnnouncement(user, id));
  const a = result.data;
  const canEdit = !!a && hasPermission(user, "announcements:manage") && (a.authorUserId === user.id || isAdmin(user));
  const [departments, classes] = canEdit ? await Promise.all([departmentOptions(user.schoolId), classOptions(user.schoolId)]) : [[], []];
  const deptHead = user.role === "DEPARTMENT_HEAD";
  return (
    <div>
      <PageHeader title="Edit announcement" breadcrumb={<Link href={`/announcements/${id}`} className="hover:underline">← Back to announcement</Link>} />
      {result.error && <Alert tone="error">{result.error}</Alert>}
      {a && !canEdit && <Alert tone="error">Only the author or an administrator can edit this announcement.</Alert>}
      {a && canEdit && (
        <Card>
          <AnnouncementForm
            initial={{ id: a.id, title: a.title, body: a.body, audience: a.audience, targetId: a.targetId, priority: a.priority, publishAt: a.publishAt, expiresAt: a.expiresAt }}
            departments={deptHead ? departments.filter((d) => d.id === user.departmentId) : departments}
            classes={classes}
            allowedAudiences={deptHead ? ["DEPARTMENT", "CLASS"] : undefined}
          />
        </Card>
      )}
    </div>
  );
}
