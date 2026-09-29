import Link from "next/link";
import { requireCurrentUser } from "@/lib/auth/session";
import { Card, PageHeader } from "@/components/ui";
import { EntityForm } from "../../_components/entity-form";
import { departmentOptions } from "../../_lib/options";
import { staffFields } from "../_fields";

export const dynamic = "force-dynamic";

export default async function NewStaffPage() {
  const user = await requireCurrentUser();
  const departments = await departmentOptions(user);
  return (
    <div className="space-y-6">
      <PageHeader
        title="Add staff member"
        breadcrumb={
          <Link href="/admin/staff" className="hover:underline">
            Staff
          </Link>
        }
      />
      <Card>
        <EntityForm testId="staff-form" action="/api/staff" idPath="staff.id" redirectTo="/admin/staff/{id}" submitLabel="Create staff member" cancelHref="/admin/staff" initial={{ staffType: "OTHER", role: "STAFF" }} fields={staffFields({ departments, mode: "create" })} />
      </Card>
    </div>
  );
}
