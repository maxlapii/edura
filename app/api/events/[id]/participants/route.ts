import { withAuth, parseBody, created } from "@/lib/api";
import { addEventParticipants, addEventParticipantsSchema } from "@/modules/events";

export const POST = withAuth(async ({ req, user, params }) => created(await addEventParticipants(user, params.id, await parseBody(req, addEventParticipantsSchema))), { permission: "events:manage" });
