import { z } from "zod";
import { withAuth, parseBody, parseQuery, created } from "@/lib/api";
import { createAcademicYear, createAcademicYearSchema, listAcademicYears } from "@/modules/academic";

const listQuerySchema = z.object({ schoolId: z.string().optional() });

export const GET = withAuth(async ({ req, user }) => listAcademicYears(user, parseQuery(req, listQuerySchema).schoolId));

export const POST = withAuth(async ({ req, user }) => created(await createAcademicYear(user, await parseBody(req, createAcademicYearSchema))), { permission: "academic:manage" });
