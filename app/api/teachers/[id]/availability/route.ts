import { withAuth, parseBody } from "@/lib/api";
import { setAvailability, setAvailabilitySchema } from "@/modules/teachers";

export const PUT = withAuth(async ({ req, user, params }) => setAvailability(user, params.id, (await parseBody(req, setAvailabilitySchema)).entries));
