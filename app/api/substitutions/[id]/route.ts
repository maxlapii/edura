import { z } from "zod";
import { withAuth, parseBody } from "@/lib/api";
import { getSubstitution, updateSubstitutionStatus } from "@/modules/substitution";

const statusBodySchema = z.object({
  status: z.enum(["DECLINED", "COMPLETED", "CANCELLED", "PENDING"]),
  note: z.string().max(500).optional().nullable(),
});

export const GET = withAuth(async ({ user, params }) => getSubstitution(user, params.id), { permission: "substitution:read" });

export const PATCH = withAuth(async ({ req, user, params }) => {
  const body = await parseBody(req, statusBodySchema);
  // The service allows the assigned substitute to DECLINE and requires substitution:manage for everything else.
  return updateSubstitutionStatus(user, params.id, body.status, body.note);
}, { permission: "substitution:read" });
