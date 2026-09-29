import { withAuth, parseBody } from "@/lib/api";
import { setPasswordSchema, setUserPassword } from "@/modules/users";

export const PUT = withAuth(
  async ({ req, user, params }) => setUserPassword(user, params.id, (await parseBody(req, setPasswordSchema)).password),
  { permission: "users:manage" },
);
