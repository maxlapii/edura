import { z } from "zod";
import { withAuth, parseBody, parseQuery, created } from "@/lib/api";
import { createSubject, createSubjectSchema, listSubjects } from "@/modules/subjects";

const listQuerySchema = z.object({ schoolId: z.string().optional(), departmentId: z.string().optional() });

export const GET = withAuth(async ({ req, user }) => {
  const query = parseQuery(req, listQuerySchema);
  return listSubjects(user, query.schoolId, query.departmentId);
}, { permission: "subjects:read" });

export const POST = withAuth(async ({ req, user }) => created(await createSubject(user, await parseBody(req, createSubjectSchema))), { permission: "subjects:manage" });
