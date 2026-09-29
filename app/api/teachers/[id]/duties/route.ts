import { withAuth, parseBody, created } from "@/lib/api";
import { addDuty, dutySchema } from "@/modules/teachers";

export const POST = withAuth(async ({ req, user, params }) => created(await addDuty(user, params.id, await parseBody(req, dutySchema))), { permission: "teachers:manage" });
