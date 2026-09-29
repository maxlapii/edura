import Link from "next/link";
import { requireCurrentUser } from "@/lib/auth/session";
import { getUser } from "@/modules/users";
import { Alert, Card, DescriptionList, PageHeader, StatusBadge } from "@/components/ui";
import { fmtDateTime } from "@/lib/format";
import { EntityForm } from "../../_components/entity-form";
import { TemporaryPasswordNotice } from "../../_components/temporary-password";
import { guarded, str } from "../../_lib/guard";
import { enumOptions } from "../../_lib/options";
import type { PageProps } from "../../_lib/types";

export const dynamic = "force-dynamic";

const ROLES = ["SUPER_ADMIN", "SCHOOL_ADMIN", "PRINCIPAL", "DEPARTMENT_HEAD", "TEACHER", "STUDENT", "PARENT", "STAFF"] as const;

export default async function UserDetailPage({ params, searchParams }: PageProps<{ id: string }>) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const actor = await requireCurrentUser();
  const res = await guarded(() => getUser(actor, id));
  if (!res.ok) return <Alert tone="error">{res.error}</Alert>;
  const u = res.data;
  const roles = actor.role === "SUPER_ADMIN" ? ROLES : ROLES.filter((r) => r !== "SUPER_ADMIN");
  return (
    <div className="space-y-6">
      <TemporaryPasswordNotice entityId={u.id} password={str(sp, "tempPassword")} />
      <PageHeader
        title={u.name}
        description={u.email}
        breadcrumb={
          <Link href="/admin/users" className="hover:underline">
            Users
          </Link>
        }
        actions={<StatusBadge status={u.isActive ? "ACTIVE" : "INACTIVE"} />}
      />
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Card title="Account">
            <EntityForm
              testId="user-form"
              method="PATCH"
              action={`/api/users/${u.id}`}
              initial={u as unknown as Record<string, unknown>}
              fields={[
                { name: "name", label: "Name", required: true },
                { name: "email", label: "Email", type: "email", required: true },
                { name: "role", label: "Role", type: "select", options: enumOptions(roles), required: true, hint: "Changing the role does not create or remove teacher/student profiles." },
                { name: "phone", label: "Phone", nullable: true },
                { name: "isActive", label: "Active (can sign in)", type: "checkbox", disabled: actor.id === u.id },
              ]}
            />
          </Card>
        </div>
        <div className="space-y-6">
          <Card title="Set password" description="Signs the user out of every session.">
            <EntityForm testId="password-form" method="PUT" action={`/api/users/${u.id}/password`} submitLabel="Set password" resetOnSuccess columns={1} compact successMessage="Password updated." fields={[{ name: "password", label: "New password", type: "password", required: true, hint: "At least 8 characters" }]} />
          </Card>
          <Card title="Details">
            <DescriptionList items={[{ label: "Created", value: fmtDateTime(u.createdAt) }, { label: "Updated", value: fmtDateTime(u.updatedAt) }]} />
          </Card>
        </div>
      </div>
    </div>
  );
}
