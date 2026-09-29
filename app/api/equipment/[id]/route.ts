import { withAuth, parseBody, noContent } from "@/lib/api";
import { deleteEquipment, updateEquipment, updateEquipmentSchema } from "@/modules/facilities";

export const PATCH = withAuth(async ({ req, user, params }) => updateEquipment(user, params.id, await parseBody(req, updateEquipmentSchema)), { permission: "rooms:manage" });

export const DELETE = withAuth(
  async ({ user, params }) => {
    await deleteEquipment(user, params.id);
    return noContent();
  },
  { permission: "rooms:manage" },
);
