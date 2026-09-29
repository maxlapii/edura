import { withAuth, parseBody, created } from "@/lib/api";
import { addCertification, certificationSchema } from "@/modules/teachers";

export const POST = withAuth(async ({ req, user, params }) => created(await addCertification(user, params.id, await parseBody(req, certificationSchema))));
