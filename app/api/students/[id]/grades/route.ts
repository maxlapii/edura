import { z } from "zod";
import { withAuth, parseQuery } from "@/lib/api";
import { studentGrades } from "@/modules/grades";

const querySchema = z.object({ termId: z.string().optional() });

export const GET = withAuth(async ({ req, user, params }) => studentGrades(user, params.id, parseQuery(req, querySchema).termId), { permission: "grades:read" });
