import { requireCurrentUser } from "@/lib/auth/session";
import { getTeacher } from "@/modules/teachers";
import { listPeriods } from "@/modules/timetable";
import { Alert, Badge, Card, EmptyState, PageHeader, StatusBadge, Table, TBody, TD, TH, THead, TR } from "@/components/ui";
import { fmtDate } from "@/lib/format";
import { ActionButton } from "../_components/action-button";
import { ServiceError } from "../_components/service-error";
import { load } from "../_lib/load";
import { daysUntil } from "../_lib/helpers";
import { AvailabilityForm, type Entry } from "./availability-form";
import { CertificationForm } from "./certification-form";
import { PdForm } from "./pd-form";

export const dynamic = "force-dynamic";

export default async function ProfessionalDevelopmentPage() {
  const user = await requireCurrentUser();
  const teacherId = user.teacherId;
  if (!teacherId) {
    return (
      <div>
        <PageHeader title="Professional development" />
        <Alert tone="info">Your account has no teaching profile.</Alert>
      </div>
    );
  }
  const result = await load(async () => {
    const [teacher, periods] = await Promise.all([getTeacher(user, teacherId), listPeriods(user)]);
    return { teacher, periods };
  });
  if (!result.ok) return <ServiceError error={result.error} />;
  const { teacher, periods } = result.data;
  const expiring = teacher.certifications.filter((c) => {
    const d = daysUntil(c.expiresAt);
    return d !== null && d <= 30;
  });
  const availability: Entry[] = teacher.availability.map((a) => ({ dayOfWeek: a.dayOfWeek, periodId: a.periodId, type: a.type }));

  return (
    <div className="space-y-6">
      <PageHeader title="Professional development" description={`${teacher.user.name} · ${teacher.department?.name ?? "No department"} · ${teacher.position ?? teacher.employmentType.replace("_", " ").toLowerCase()}`} />

      {expiring.length > 0 && (
        <Alert tone="warning" title={`${expiring.length} certification${expiring.length === 1 ? "" : "s"} expiring soon or expired`}>
          {expiring.map((c) => `${c.name} (${fmtDate(c.expiresAt)})`).join(", ")}
        </Alert>
      )}

      <Card title="Certifications" description="Expiry warnings appear 30 days ahead." padded={false}>
        {teacher.certifications.length === 0 ? (
          <div className="p-4">
            <EmptyState title="No certifications recorded" />
          </div>
        ) : (
          <Table className="rounded-t-none border-0">
            <THead>
              <tr>
                <TH>Name</TH>
                <TH>Issuer</TH>
                <TH>Issued</TH>
                <TH>Expires</TH>
                <TH />
              </tr>
            </THead>
            <TBody>
              {teacher.certifications.map((c) => {
                const d = daysUntil(c.expiresAt);
                return (
                  <TR key={c.id} data-testid="row" data-id={c.id}>
                    <TD className="font-medium text-slate-900">{c.name}</TD>
                    <TD>{c.issuer ?? "—"}</TD>
                    <TD>{fmtDate(c.issuedAt)}</TD>
                    <TD>
                      {fmtDate(c.expiresAt)}
                      {d !== null && d < 0 && <Badge tone="red" className="ml-2">Expired</Badge>}
                      {d !== null && d >= 0 && d <= 30 && <Badge tone="amber" className="ml-2">{d === 0 ? "Expires today" : `${d} days left`}</Badge>}
                    </TD>
                    <TD className="text-right">
                      <ActionButton method="DELETE" path={`/api/certifications/${c.id}`} label="Remove" variant="ghost" confirmText={`Remove certification "${c.name}"?`} />
                    </TD>
                  </TR>
                );
              })}
            </TBody>
          </Table>
        )}
        <div className="border-t border-slate-100 p-4">
          <CertificationForm teacherId={teacherId} />
        </div>
      </Card>

      <Card title="Training, goals & development plans" padded={false}>
        {teacher.professionalDev.length === 0 ? (
          <div className="p-4">
            <EmptyState title="No development records yet" />
          </div>
        ) : (
          <Table className="rounded-t-none border-0">
            <THead>
              <tr>
                <TH>Title</TH>
                <TH>Type</TH>
                <TH>Date</TH>
                <TH>Hours</TH>
                <TH>Status</TH>
              </tr>
            </THead>
            <TBody>
              {teacher.professionalDev.map((p) => (
                <TR key={p.id} data-testid="pd-row" data-id={p.id}>
                  <TD>
                    <div className="font-medium text-slate-900">{p.title}</div>
                    {p.notes && <div className="text-xs text-slate-500">{p.notes}</div>}
                  </TD>
                  <TD>{p.type.charAt(0) + p.type.slice(1).toLowerCase().replace("_", " ")}</TD>
                  <TD>{fmtDate(p.date)}</TD>
                  <TD>{p.hours ?? "—"}</TD>
                  <TD>
                    <StatusBadge status={p.status} />
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
        <div className="border-t border-slate-100 p-4">
          <PdForm teacherId={teacherId} />
        </div>
      </Card>

      <Card title="Availability" description="Mark periods you prefer, or cannot take, so substitute suggestions respect them.">
        <AvailabilityForm teacherId={teacherId} periods={periods} initial={availability} />
      </Card>
    </div>
  );
}
