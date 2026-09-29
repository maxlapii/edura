import { withAuth } from "@/lib/api";
import { getSubmission } from "@/modules/assignments";

export const GET = withAuth(async ({ user, params }) => getSubmission(user, params.id));
