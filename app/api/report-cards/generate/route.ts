import { withAuth, parseBody } from "@/lib/api";
import { generateReportCards, generateReportCardsSchema } from "@/modules/reportCards";

export const POST = withAuth(async ({ req, user }) => generateReportCards(user, await parseBody(req, generateReportCardsSchema)), { permission: "report_cards:manage" });
