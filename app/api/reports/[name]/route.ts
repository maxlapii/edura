import { withAuth, parseQuery } from "@/lib/api";
import { AppError } from "@/lib/utils/errors";
import { csvResponse, toCsv } from "@/lib/reports/csv";
import { generateReport, isReportName, reportQuerySchema } from "@/modules/reports";

export const GET = withAuth(async ({ req, user, params }) => {
  if (!isReportName(params.name)) throw AppError.notFound("Report");
  const query = parseQuery(req, reportQuerySchema);
  const report = await generateReport(user, params.name, query);
  if (query.format === "csv") return csvResponse(`${report.name}.csv`, toCsv(report.rows, report.columns));
  return report;
});
