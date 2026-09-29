import { z } from "zod";
import { withAuth, parseBody, parseQuery, created } from "@/lib/api";
import { createDepartment, createDepartmentSchema, listDepartments } from "@/modules/departments";

const listQuerySchema = z.object({ schoolId: z.string().optional() });

export const GET = withAuth(async ({ req, user }) => listDepartments(user, parseQuery(req, listQuerySchema).schoolId), { permission: "departments:read" });

export const POST = withAuth(async ({ req, user }) => created(await createDepartment(user, await parseBody(req, createDepartmentSchema))), { permission: "departments:manage" });
