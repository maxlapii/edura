import Link from "next/link";
import { notFound } from "next/navigation";
import { requireCurrentUser } from "@/lib/auth/session";
import { getUserProfile } from "@/modules/users";
import { Card, DescriptionList, PageHeader, StatusBadge } from "@/components/ui";
import { fmtDateTime, humanize } from "@/lib/format";
import { ChangePasswordForm } from "./change-password-form";

export const dynamic = "force-dynamic";

export default async function ProfilePage() {
  const user = await requireCurrentUser();
  const profile = await getUserProfile(user);
  if (!profile) notFound();

  const roleItems = profile.teacher
    ? [
        { label: "Employee number", value: profile.teacher.employeeNumber },
        { label: "Department", value: profile.teacher.department?.name ?? "—" },
        { label: "Teacher status", value: <StatusBadge status={profile.teacher.status} /> },
      ]
    : profile.staff
      ? [
          { label: "Employee number", value: profile.staff.employeeNumber },
          { label: "Staff type", value: humanize(profile.staff.staffType) },
        ]
      : profile.student
        ? [{ label: "Student number", value: profile.student.studentNumber }]
        : profile.guardian
          ? [
              {
                label: "Children",
                value: profile.guardian.students.length
                  ? profile.guardian.students.map((s) => (
                      <Link key={s.student.id} href={`/students/${s.student.id}`} className="mr-2 text-brand-700 hover:underline">
                        {s.student.firstName} {s.student.lastName}
                      </Link>
                    ))
                  : "—",
              },
            ]
          : [];

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader title="My profile" description="Your account details and security settings." />
      <Card title="Account">
        <DescriptionList
          items={[
            { label: "Name", value: profile.name },
            { label: "Email", value: profile.email },
            { label: "Phone", value: profile.phone ?? "—" },
            { label: "Role", value: humanize(profile.role) },
            { label: "School", value: profile.school ? `${profile.school.name} (${profile.school.code})` : "—" },
            { label: "Member since", value: fmtDateTime(profile.createdAt) },
            ...roleItems,
          ]}
        />
        {profile.teacher && (
          <p className="mt-3 text-xs text-slate-500">
            Certifications, training and availability are managed under{" "}
            <Link href="/professional-development" className="text-brand-700 hover:underline">
              Professional development
            </Link>
            .
          </p>
        )}
      </Card>
      <Card title="Change password" description="You will stay signed in here; other sessions are revoked.">
        <ChangePasswordForm />
      </Card>
    </div>
  );
}
