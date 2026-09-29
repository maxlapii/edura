import { withAuth, parseBody, parseQuery, created } from "@/lib/api";
import { createGuardian, createGuardianSchema, listGuardians, listGuardiansSchema } from "@/modules/guardians";

export const GET = withAuth(async ({ req, user }) => listGuardians(user, parseQuery(req, listGuardiansSchema)), { permission: "guardians:read" });

export const POST = withAuth(async ({ req, user }) => created(await createGuardian(user, await parseBody(req, createGuardianSchema))), { permission: "guardians:manage" });
