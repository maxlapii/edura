import { withAuth, parseBody, created } from "@/lib/api";
import { addProfessionalDevelopment, professionalDevelopmentSchema } from "@/modules/teachers";

export const POST = withAuth(async ({ req, user, params }) =>
  created(await addProfessionalDevelopment(user, params.id, await parseBody(req, professionalDevelopmentSchema))),
);
