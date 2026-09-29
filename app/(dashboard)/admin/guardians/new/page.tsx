import Link from "next/link";
import { requireCurrentUser } from "@/lib/auth/session";
import { Card, PageHeader } from "@/components/ui";
import { EntityForm } from "../../_components/entity-form";
import { studentOptions } from "../../_lib/options";

export const dynamic = "force-dynamic";

export default async function NewGuardianPage() {
  const user = await requireCurrentUser();
  const students = await studentOptions(user);
  return (
    <div className="space-y-6">
      <PageHeader
        title="Add parent / guardian"
        description="Creates a parent login. A temporary password is generated when none is given."
        breadcrumb={
          <Link href="/admin/guardians" className="hover:underline">
            Parents &amp; guardians
          </Link>
        }
      />
      <Card>
        <EntityForm
          testId="guardian-form"
          action="/api/guardians"
          idPath="guardian.id"
          redirectTo="/admin/guardians/{id}"
          submitLabel="Create guardian"
          cancelHref="/admin/guardians"
          initial={{ relationship: "PARENT" }}
          fields={[
            { name: "name", label: "Full name", required: true },
            { name: "email", label: "Email", type: "email", required: true },
            { name: "password", label: "Password", type: "password", hint: "Optional – leave empty to generate a temporary password" },
            { name: "phone", label: "Phone" },
            { name: "address", label: "Address", className: "sm:col-span-2" },
            { name: "studentIds", label: "Children", type: "multiselect", options: students, className: "sm:col-span-2" },
            { name: "relationship", label: "Relationship", placeholder: "PARENT" },
          ]}
        />
      </Card>
    </div>
  );
}
