import { prisma } from "@/lib/db";
import type { AuthUser } from "@/lib/auth/types";

export interface AuditInput {
  user?: Pick<AuthUser, "id" | "schoolId"> | null;
  schoolId?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  before?: unknown;
  after?: unknown;
  metadata?: unknown;
  ipAddress?: string | null;
}

function toJson(v: unknown) {
  if (v === undefined) return undefined;
  return JSON.parse(JSON.stringify(v, (_k, val) => (typeof val === "bigint" ? val.toString() : val)));
}

/** Records an audit trail entry. Never throws — auditing must not break business operations. */
export async function audit(input: AuditInput): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        schoolId: input.schoolId ?? input.user?.schoolId ?? null,
        userId: input.user?.id ?? null,
        action: input.action,
        entityType: input.entityType,
        entityId: input.entityId ?? null,
        before: toJson(input.before) ?? undefined,
        after: toJson(input.after) ?? undefined,
        metadata: toJson(input.metadata) ?? undefined,
        ipAddress: input.ipAddress ?? null,
      },
    });
  } catch (err) {
    console.error("[audit] failed to write audit log", err);
  }
}

export async function listAuditLogs(schoolId: string, opts: { entityType?: string; entityId?: string; take?: number } = {}) {
  return prisma.auditLog.findMany({
    where: { schoolId, entityType: opts.entityType, entityId: opts.entityId },
    orderBy: { createdAt: "desc" },
    take: opts.take ?? 100,
    include: { user: { select: { id: true, name: true, email: true } } },
  });
}
