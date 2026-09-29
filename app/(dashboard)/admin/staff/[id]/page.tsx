import Link from "next/link";
import { requireCurrentUser } from "@/lib/auth/session";
import { getStaff } from "@/modules/staff";
import { Alert, Card, DescriptionList, LinkButton, PageHeader, StatusBadge } from "@/components/ui";
import { humanize } from "@/lib/format";
import { EntityForm } from "../../_components/entity-form";
import { TemporaryPasswordNotice } from "../../_components/temporary-password";
import { guarded, str } from "../../_lib/guard";
import { departmentOptions } from "../../_lib/options";
import type { PageProps } from "../../_lib/types";
import { staffFields } from "../_fields";

export const dynamic = "force-dynamic";

export default async function StaffDetailPage({ params, searchParams }: PageProps<{ id: string }>) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const user = await requireCurrentUser();
  const res = await guarded(() => getStaff(user, id));
  if (!res.ok) return <Alert tone="error">{res.error}</Alert>;
  const staff = res.data;
  const departments = await departmentOptions(user);
  const initial = { ...staff, name: staff.user.name, phone: staff.user.phone } as unknown as Record<string, unknown>;
  return (
    <div className="space-y-6">
      <TemporaryPasswordNotice entityId={staff.id} password={str(sp, "tempPassword")} />
      <PageHeader
        title={staff.user.name}
        description={`${staff.employeeNumber} · ${humanize(staff.staffType)}${staff.position ? ` · ${staff.position}` : ""}`}
        breadcrumb={
          <Link href="/admin/staff" className="hover:underline">
            Staff
          </Link>
        }
        actions={
          <>
            <StatusBadge status={staff.status} />
            <LinkButton href={`/admin/users/${staff.user.id}`} variant="outline" size="sm">
              Login &amp; password
            </LinkButton>
          </>
        }
      />
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Card title="Profile">
            <EntityForm testId="staff-form" method="PATCH" action={`/api/staff/${staff.id}`} initial={initial} fields={staffFields({ departments, mode: "edit" })} />
          </Card>
        </div>
        <Card title="Account">
          <DescriptionList
            items={[
              { label: "Email", value: staff.user.email },
              { label: "System role", value: humanize(staff.user.role) },
              { label: "Login", value: <StatusBadge status={staff.user.isActive ? "ACTIVE" : "INACTIVE"} /> },
              { label: "Department", value: staff.department?.name ?? "—" },
            ]}
          />
        </Card>
      </div>
    </div>
  );
}
