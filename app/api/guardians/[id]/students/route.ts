import { z } from "zod";
import { withAuth, parseBody, parseQuery, created, noContent } from "@/lib/api";
import { linkStudent, linkStudentSchema, unlinkStudent } from "@/modules/guardians";

const unlinkQuerySchema = z.object({ studentId: z.string().min(1) });

export const POST = withAuth(async ({ req, user, params }) => created(await linkStudent(user, params.id, await parseBody(req, linkStudentSchema))), { permission: "guardians:manage" });

export const DELETE = withAuth(async ({ req, user, params }) => {
  await unlinkStudent(user, params.id, parseQuery(req, unlinkQuerySchema).studentId);
  return noContent();
}, { permission: "guardians:manage" });
