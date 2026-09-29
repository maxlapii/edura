import { withAuth, parseBody } from "@/lib/api";
import { assignStudentsSchema, assignStudentsToClass } from "@/modules/classes";

export const POST = withAuth(
  async ({ req, user, params }) => assignStudentsToClass(user, params.id, (await parseBody(req, assignStudentsSchema)).studentIds),
  { permission: "classes:manage" },
);
