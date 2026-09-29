import { withAuth } from "@/lib/api";
import { REPORT_CATALOG } from "@/modules/reports";

export const GET = withAuth(async () => REPORT_CATALOG.map((r) => ({ ...r, url: `/api/reports/${r.name}` })));
