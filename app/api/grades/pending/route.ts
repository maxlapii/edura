import { z } from "zod";
import { withAuth, parseQuery } from "@/lib/api";
import { pendingGrading } from "@/modules/grades";

const querySchema = z.object({ teacherId: z.string().optional() });

export const GET = withAuth(async ({ req, user }) => pendingGrading(user, parseQuery(req, querySchema).teacherId), { permission: "grades:read" });
