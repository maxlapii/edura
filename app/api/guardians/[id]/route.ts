import { withAuth, parseBody } from "@/lib/api";
import { getGuardian, updateGuardian, updateGuardianSchema } from "@/modules/guardians";

export const GET = withAuth(async ({ user, params }) => getGuardian(user, params.id));

export const PATCH = withAuth(async ({ req, user, params }) => updateGuardian(user, params.id, await parseBody(req, updateGuardianSchema)));
