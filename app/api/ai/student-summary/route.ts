import { withAuth, parseBody } from "@/lib/api";
import { studentSummarySchema, summarizeStudentProgress } from "@/modules/ai";

export const POST = withAuth(async ({ req, user }) => summarizeStudentProgress(user, await parseBody(req, studentSummarySchema)), { permission: ["ai:teacher", "ai:admin"] });
