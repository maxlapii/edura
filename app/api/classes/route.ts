import { withAuth, parseBody, parseQuery, created } from "@/lib/api";
import { createClass, createClassSchema, listClasses, listClassesSchema } from "@/modules/classes";

export const GET = withAuth(async ({ req, user }) => listClasses(user, parseQuery(req, listClassesSchema)), { permission: "classes:read" });

export const POST = withAuth(async ({ req, user }) => created(await createClass(user, await parseBody(req, createClassSchema))), { permission: "classes:manage" });
