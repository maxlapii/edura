import { withAuth, parseQuery } from "@/lib/api";
import { listReportCards, listReportCardsSchema } from "@/modules/reportCards";

export const GET = withAuth(async ({ req, user }) => listReportCards(user, parseQuery(req, listReportCardsSchema)), { permission: "report_cards:read" });
