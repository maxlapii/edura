import { redirect } from "next/navigation";
import { requireCurrentUser } from "@/lib/auth/session";
import { getSchool, getSchoolSettings } from "@/modules/schools";
import { listPeriods } from "@/modules/timetable";
import { Alert, Card, PageHeader } from "@/components/ui";
import { EntityForm } from "../_components/entity-form";
import { guarded } from "../_lib/guard";
import { PeriodsEditor } from "./periods-editor";

export const dynamic = "force-dynamic";

export default async function SchoolSettingsPage() {
  const user = await requireCurrentUser();
  if (!user.schoolId) redirect("/admin/schools");
  const schoolId = user.schoolId;
  const res = await guarded(async () => {
    const [school, settings, periods] = await Promise.all([getSchool(user, schoolId), getSchoolSettings(schoolId), listPeriods(user)]);
    return { school, settings, periods };
  });
  if (!res.ok) return <Alert tone="error">{res.error}</Alert>;
  const { school, settings, periods } = res.data;
  return (
    <div className="space-y-6">
      <PageHeader title="School settings" description={school.name} />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="School profile">
          <EntityForm
            testId="school-form"
            method="PATCH"
            action={`/api/schools/${school.id}`}
            initial={school as unknown as Record<string, unknown>}
            fields={[
              { name: "name", label: "Name", required: true },
              { name: "code", label: "Code", required: true },
              { name: "address", label: "Address", className: "sm:col-span-2", nullable: true },
              { name: "phone", label: "Phone", nullable: true },
              { name: "email", label: "Email", type: "email", nullable: true },
              { name: "timezone", label: "Timezone" },
            ]}
          />
        </Card>
        <Card title="Automation settings" description="Thresholds used by attendance alerts, grade reminders and certification warnings.">
          <EntityForm
            testId="school-settings-form"
            method="PATCH"
            action={`/api/schools/${school.id}`}
            wrap="settings"
            initial={settings as unknown as Record<string, unknown>}
            fields={[
              { name: "absenceThreshold", label: "Absence threshold", type: "number", min: 1, max: 60, required: true, hint: "Absences that trigger an alert" },
              { name: "absenceWindowDays", label: "Absence window (days)", type: "number", min: 1, max: 365, required: true },
              { name: "gradeSubmissionReminderDays", label: "Grade reminder (days before deadline)", type: "number", min: 0, max: 30, required: true },
              { name: "certificationExpiryWarningDays", label: "Certification expiry warning (days)", type: "number", min: 1, max: 365, required: true },
              { name: "maxWeeklyPeriods", label: "Default max weekly periods", type: "number", min: 1, max: 60, required: true },
            ]}
          />
        </Card>
      </div>
      <Card title="Periods" description="The daily lesson periods used by the timetable.">
        <PeriodsEditor periods={periods} />
      </Card>
    </div>
  );
}
