import { requireCurrentUser } from "@/lib/auth/session";
import { listAuditLogs } from "@/lib/audit";
import { prisma } from "@/lib/db";
import { resolveSchoolId } from "@/lib/permissions";
import { Alert, PageHeader, Table, TBody, TD, TH, THead, TR } from "@/components/ui";
import { fmtDateTime } from "@/lib/format";
import { FilterBar, FilterField, FilterInput, FilterSelect } from "../_components/filter-bar";
import { JsonDetails } from "../_components/json-view";
import { guarded, int, str } from "../_lib/guard";
import type { PageProps } from "../_lib/types";

export const dynamic = "force-dynamic";

export default async function AuditPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const user = await requireCurrentUser();
  const entityType = str(sp, "entityType");
  const entityId = str(sp, "entityId");
  const take = Math.min(500, int(sp, "take", 100));
  const res = await guarded(async () => {
    const schoolId = resolveSchoolId(user);
    const [logs, types] = await Promise.all([listAuditLogs(schoolId, { entityType, entityId, take }), prisma.auditLog.findMany({ where: { schoolId }, distinct: ["entityType"], select: { entityType: true }, orderBy: { entityType: "asc" } })]);
    return { logs, types: types.map((t) => t.entityType) };
  });
  if (!res.ok) return <Alert tone="error">{res.error}</Alert>;
  const { logs, types } = res.data;
  return (
    <div className="space-y-4">
      <PageHeader title="Audit log" description="Who changed what, and when." />
      <FilterBar action="/admin/audit">
        <FilterField label="Entity type">
          <FilterSelect name="entityType" defaultValue={entityType ?? ""} options={types.map((t) => ({ value: t, label: t }))} />
        </FilterField>
        <FilterField label="Entity id">
          <FilterInput name="entityId" defaultValue={entityId} placeholder="Optional" />
        </FilterField>
        <FilterField label="Rows">
          <FilterSelect name="take" defaultValue={String(take)} options={[{ value: "100", label: "100" }, { value: "250", label: "250" }, { value: "500", label: "500" }]} empty={null} />
        </FilterField>
      </FilterBar>
      <Table>
        <THead>
          <TR>
            <TH>When</TH>
            <TH>User</TH>
            <TH>Action</TH>
            <TH>Entity</TH>
            <TH>Before</TH>
            <TH>After</TH>
            <TH>Metadata</TH>
          </TR>
        </THead>
        <TBody>
          {logs.map((l) => (
            <TR key={l.id} data-testid="row" data-id={l.id}>
              <TD className="whitespace-nowrap">{fmtDateTime(l.createdAt)}</TD>
              <TD>
                {l.user?.name ?? <span className="text-slate-400">system</span>}
                {l.user && <div className="text-xs text-slate-500">{l.user.email}</div>}
              </TD>
              <TD>
                <code className="text-xs">{l.action}</code>
              </TD>
              <TD>
                <div>{l.entityType}</div>
                {l.entityId && <div className="max-w-[10rem] truncate font-mono text-xs text-slate-500">{l.entityId}</div>}
              </TD>
              <TD>
                <JsonDetails summary="before" value={l.before} />
              </TD>
              <TD>
                <JsonDetails summary="after" value={l.after} />
              </TD>
              <TD>
                <JsonDetails summary="metadata" value={l.metadata} />
              </TD>
            </TR>
          ))}
          {logs.length === 0 && (
            <TR>
              <TD colSpan={7} className="text-center text-slate-500">
                No audit entries.
              </TD>
            </TR>
          )}
        </TBody>
      </Table>
    </div>
  );
}
