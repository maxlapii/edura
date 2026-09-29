import Link from "next/link";
import { requireCurrentUser } from "@/lib/auth/session";
import { hasPermission, isAdmin, isStaffLike } from "@/lib/permissions";
import { Alert, Card, PageHeader } from "@/components/ui";
import { allowedRecipientsForStudentLike, classOptions, departmentOptions, schoolUsers } from "@/components/work/lookups";
import { param, type SearchParams } from "@/components/work/guard";
import { MessageForm } from "./message-form";

export const dynamic = "force-dynamic";

export default async function NewMessagePage({ searchParams }: { searchParams: SearchParams }) {
  const user = await requireCurrentUser();
  const sp = await searchParams;
  if (!hasPermission(user, "messages:send")) {
    return (
      <div>
        <PageHeader title="New message" breadcrumb={<Link href="/messages">← Messages</Link>} />
        <Alert tone="error">You do not have permission to send messages.</Alert>
      </div>
    );
  }
  const staff = isStaffLike(user);
  const [users, classes, departments] = await Promise.all([
    staff ? schoolUsers(user.schoolId) : allowedRecipientsForStudentLike(user),
    staff ? classOptions(user.schoolId) : Promise.resolve(undefined),
    staff ? departmentOptions(user.schoolId) : Promise.resolve(undefined),
  ]);
  const to = (param(sp.to) ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  return (
    <div>
      <PageHeader title="New message" breadcrumb={<Link href="/messages" className="hover:underline">← Messages</Link>} description={staff ? "Message individual users, a whole class, a department or an audience." : "You can message your teachers and school administrators."} />
      <Card>
        <MessageForm
          users={users.filter((u) => u.id !== user.id)}
          classes={classes}
          departments={departments}
          canPickAudience={isAdmin(user)}
          canUseTemplates={staff}
          prefill={{ to, classId: param(sp.classId), threadId: param(sp.threadId), subject: param(sp.subject), studentId: param(sp.studentId) }}
        />
      </Card>
    </div>
  );
}
