import { withAuth, parseBody, parseQuery, created } from "@/lib/api";
import { createSupportCase, createSupportCaseSchema, listSupportCases, listSupportCasesSchema } from "@/modules/supportCases";

export const GET = withAuth(async ({ req, user }) => listSupportCases(user, parseQuery(req, listSupportCasesSchema)), { permission: "support_cases:read" });

export const POST = withAuth(async ({ req, user }) => created(await createSupportCase(user, await parseBody(req, createSupportCaseSchema))), { permission: "support_cases:manage" });
