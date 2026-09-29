import { withAuth, parseBody, parseQuery, created } from "@/lib/api";
import { createSubstitution, createSubstitutionSchema, listSubstitutions, listSubstitutionsSchema } from "@/modules/substitution";

export const GET = withAuth(async ({ req, user }) => listSubstitutions(user, parseQuery(req, listSubstitutionsSchema)), { permission: "substitution:read" });

export const POST = withAuth(async ({ req, user }) => created(await createSubstitution(user, await parseBody(req, createSubstitutionSchema))), { permission: "substitution:manage" });
