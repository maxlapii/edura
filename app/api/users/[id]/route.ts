import { withAuth, parseBody } from "@/lib/api";
import { getUser, updateUser, updateUserSchema } from "@/modules/users";

export const GET = withAuth(async ({ user, params }) => getUser(user, params.id), { permission: "users:manage" });

export const PATCH = withAuth(async ({ req, user, params }) => updateUser(user, params.id, await parseBody(req, updateUserSchema)), { permission: "users:manage" });
