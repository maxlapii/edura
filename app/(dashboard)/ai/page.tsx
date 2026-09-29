import { prisma } from "@/lib/db";
import { requireCurrentUser } from "@/lib/auth/session";
import { hasAnyPermission, hasPermission } from "@/lib/permissions";
import { AI_MODEL, isAiConfigured } from "@/lib/ai/client";
import { toolsForUser } from "@/lib/ai/tools";
import { accessibleStudentWhere } from "@/modules/students/service";
import { Alert, PageHeader } from "@/components/ui";
import { Assistant } from "./assistant";

export const dynamic = "force-dynamic";

export default async function AiAssistantPage() {
  const user = await requireCurrentUser();
  if (!hasAnyPermission(user, ["ai:teacher", "ai:admin"])) {
    return (
      <>
        <PageHeader title="AI assistant" />
        <Alert tone="error">Your role does not have access to the AI assistant.</Alert>
      </>
    );
  }

  const configured = isAiConfigured();
  const tools = toolsForUser(user).map((t) => t.name);
  // Students the caller may message (their class rosters, or the whole school for administrators).
  const students = user.schoolId && hasPermission(user, "messages:send")
    ? await prisma.student.findMany({
        where: { ...(await accessibleStudentWhere(user, user.schoolId)), status: "ACTIVE" },
        select: { id: true, firstName: true, lastName: true, class: { select: { name: true } } },
        orderBy: [{ class: { name: "asc" } }, { lastName: "asc" }, { firstName: "asc" }],
        take: 500,
      })
    : [];

  return (
    <>
      <PageHeader title="AI assistant" description="Ask questions about your school data, or draft lesson plans and parent messages. Drafts are never saved or sent without you." />
      {!configured && (
        <div className="mb-4">
          <Alert tone="warning" title="AI assistant is not configured">
            Set <code className="rounded bg-amber-100 px-1">ANTHROPIC_API_KEY</code> in the server environment to enable the assistant. Everything else in Edura keeps working.
          </Alert>
        </div>
      )}
      <Assistant
        configured={configured}
        model={AI_MODEL}
        tools={tools}
        isAdmin={hasPermission(user, "ai:admin")}
        students={students.map((s) => ({ id: s.id, name: `${s.firstName} ${s.lastName}`, className: s.class?.name ?? null }))}
      />
    </>
  );
}
