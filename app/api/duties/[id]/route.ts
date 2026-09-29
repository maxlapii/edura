import { withAuth, noContent } from "@/lib/api";
import { removeDuty } from "@/modules/teachers";

export const DELETE = withAuth(async ({ user, params }) => {
  await removeDuty(user, params.id);
  return noContent();
}, { permission: "teachers:manage" });
