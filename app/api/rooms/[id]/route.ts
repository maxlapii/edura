import { withAuth, parseBody } from "@/lib/api";
import { deactivateRoom, getRoom, updateRoom, updateRoomSchema } from "@/modules/facilities";

export const GET = withAuth(async ({ user, params }) => getRoom(user, params.id), { permission: "rooms:read" });

export const PATCH = withAuth(async ({ req, user, params }) => updateRoom(user, params.id, await parseBody(req, updateRoomSchema)), { permission: "rooms:manage" });

export const DELETE = withAuth(async ({ user, params }) => deactivateRoom(user, params.id), { permission: "rooms:manage" });
