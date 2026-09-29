import { withAuth, parseBody, parseQuery, created } from "@/lib/api";
import { createRoom, createRoomSchema, listRooms, listRoomsSchema } from "@/modules/facilities";

export const GET = withAuth(async ({ req, user }) => listRooms(user, parseQuery(req, listRoomsSchema)), { permission: "rooms:read" });

export const POST = withAuth(async ({ req, user }) => created(await createRoom(user, await parseBody(req, createRoomSchema))), { permission: "rooms:manage" });
