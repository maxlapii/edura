import { withAuth } from "@/lib/api";
import { publishReportCard } from "@/modules/reportCards";

export const POST = withAuth(async ({ user, params }) => publishReportCard(user, params.id), { permission: "report_cards:manage" });
