import { withAuth, parseBody, created } from "@/lib/api";
import { submitAssignment, submitAssignmentSchema } from "@/modules/assignments";

export const POST = withAuth(async ({ req, user, params }) => created(await submitAssignment(user, params.id, await parseBody(req, submitAssignmentSchema))), { permission: "assignments:submit" });
