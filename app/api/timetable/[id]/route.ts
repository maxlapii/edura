import { withAuth, parseBody, noContent } from "@/lib/api";
import { deleteSlot, updateSlot, updateSlotSchema } from "@/modules/timetable";

export const PATCH = withAuth(async ({ req, user, params }) => updateSlot(user, params.id, await parseBody(req, updateSlotSchema)), { permission: "timetable:manage" });

export const DELETE = withAuth(async ({ user, params }) => {
  await deleteSlot(user, params.id);
  return noContent();
}, { permission: "timetable:manage" });
