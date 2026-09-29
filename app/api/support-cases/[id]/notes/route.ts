import { withAuth, parseBody, created } from "@/lib/api";
import { addSupportCaseNote, addSupportCaseNoteSchema } from "@/modules/supportCases";

export const POST = withAuth(async ({ req, user, params }) => created(await addSupportCaseNote(user, params.id, await parseBody(req, addSupportCaseNoteSchema))), { permission: "support_cases:manage" });
