import Link from "next/link";
import { requireCurrentUser } from "@/lib/auth/session";
import { getIncident } from "@/modules/discipline";
import { Alert, Badge, Card, DescriptionList, PageHeader } from "@/components/ui";
import { fmtDate, fmtDateTime, humanize } from "@/lib/format";
import { EntityForm } from "../../_components/entity-form";
import { guarded } from "../../_lib/guard";
import type { PageProps } from "../../_lib/types";
import { incidentFields } from "../_fields";

export const dynamic = "force-dynamic";

export default async function IncidentDetailPage({ params }: PageProps<{ id: string }>) {
  const { id } = await params;
  const user = await requireCurrentUser();
  const res = await guarded(() => getIncident(user, id));
  if (!res.ok) return <Alert tone="error">{res.error}</Alert>;
  const i = res.data;
  return (
    <div className="space-y-6">
      <PageHeader
        title={`${i.category} · ${i.student.firstName} ${i.student.lastName}`}
        description={`${fmtDate(i.date)} · reported by ${i.reportedBy.name} on ${fmtDateTime(i.createdAt)}`}
        breadcrumb={
          <Link href="/admin/discipline" className="hover:underline">
            Discipline
          </Link>
        }
        actions={<Badge tone={i.severity === "MINOR" ? "gray" : i.severity === "MODERATE" ? "amber" : "red"}>{humanize(i.severity)}</Badge>}
      />
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Card title="Edit incident" description="Changes are audited.">
            <EntityForm testId="incident-form" method="PATCH" action={`/api/discipline/${i.id}`} initial={i as unknown as Record<string, unknown>} fields={incidentFields({ students: [], mode: "edit" })} />
          </Card>
        </div>
        <Card title="Record">
          <DescriptionList
            items={[
              { label: "Student", value: <Link href={`/admin/students/${i.student.id}`} className="text-brand-700 hover:underline">{i.student.firstName} {i.student.lastName} ({i.student.studentNumber})</Link> },
              { label: "Class", value: i.student.class?.name ?? "—" },
              { label: "Reported by", value: i.reportedBy.name },
              { label: "Parent notified", value: i.parentNotified ? "Yes" : "No" },
              { label: "Last updated", value: fmtDateTime(i.updatedAt) },
            ]}
          />
        </Card>
      </div>
    </div>
  );
}
