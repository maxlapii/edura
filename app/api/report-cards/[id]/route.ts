import { withAuth, parseBody } from "@/lib/api";
import { getReportCard, updateReportCard, updateReportCardSchema } from "@/modules/reportCards";

export const GET = withAuth(async ({ user, params }) => getReportCard(user, params.id), { permission: "report_cards:read" });
export const PATCH = withAuth(async ({ req, user, params }) => updateReportCard(user, params.id, await parseBody(req, updateReportCardSchema)));
