import { withAuth, parseBody, parseQuery, created } from "@/lib/api";
import { createEquipment, createEquipmentSchema, listEquipment, listEquipmentSchema } from "@/modules/facilities";

export const GET = withAuth(async ({ req, user }) => listEquipment(user, parseQuery(req, listEquipmentSchema)), { permission: "rooms:read" });

export const POST = withAuth(async ({ req, user }) => created(await createEquipment(user, await parseBody(req, createEquipmentSchema))), { permission: "rooms:manage" });
