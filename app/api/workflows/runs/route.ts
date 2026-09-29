import { withAuth, parseQuery } from "@/lib/api";
import { listRuns, listRunsSchema } from "@/modules/workflows";

export const GET = withAuth(async ({ req, user }) => listRuns(user, parseQuery(req, listRunsSchema)), { permission: "workflows:manage" });
