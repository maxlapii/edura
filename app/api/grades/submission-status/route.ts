import { z } from "zod";
import { withAuth, parseQuery } from "@/lib/api";
import { gradeSubmissionStatus } from "@/modules/grades";

const querySchema = z.object({ termId: z.string().optional() });

export const GET = withAuth(async ({ req, user }) => gradeSubmissionStatus(user, parseQuery(req, querySchema).termId), { permission: "reports:school" });
