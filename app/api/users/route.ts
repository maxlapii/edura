import { withAuth, parseBody, parseQuery, created } from "@/lib/api";
import { createUser, createUserSchema, listUsers, listUsersSchema } from "@/modules/users";

export const GET = withAuth(async ({ req, user }) => listUsers(user, parseQuery(req, listUsersSchema)), { permission: "users:manage" });

export const POST = withAuth(async ({ req, user }) => created(await createUser(user, await parseBody(req, createUserSchema))), { permission: "users:manage" });
