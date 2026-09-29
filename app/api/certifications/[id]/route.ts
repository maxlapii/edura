import { withAuth, noContent } from "@/lib/api";
import { removeCertification } from "@/modules/teachers";

export const DELETE = withAuth(async ({ user, params }) => {
  await removeCertification(user, params.id);
  return noContent();
});
