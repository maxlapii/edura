import { z } from "zod";
import { withAuth, parseQuery } from "@/lib/api";
import { listAuditLogs } from "@/lib/audit";
import { resolveSchoolId } from "@/lib/permissions";

const querySchema = z.object({
  entityType: z.string().optional(),
  entityId: z.string().optional(),
  take: z.coerce.number().int().min(1).max(500).optional(),
});

export const GET = withAuth(async ({ req, user }) => listAuditLogs(resolveSchoolId(user), parseQuery(req, querySchema)), { permission: "audit:read" });
