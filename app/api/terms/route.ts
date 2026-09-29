import { z } from "zod";
import { withAuth, parseBody, parseQuery, created } from "@/lib/api";
import { createTerm, createTermSchema, listTerms } from "@/modules/academic";

const listQuerySchema = z.object({ academicYearId: z.string().optional() });

export const GET = withAuth(async ({ req, user }) => listTerms(user, parseQuery(req, listQuerySchema).academicYearId));

export const POST = withAuth(async ({ req, user }) => created(await createTerm(user, await parseBody(req, createTermSchema))), { permission: "academic:manage" });
