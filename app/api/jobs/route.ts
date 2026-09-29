import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/api";
import { runAllJobs, runJob, recentJobRuns, JOBS, type JobName } from "@/lib/jobs";

/** Trigger scheduled jobs. Either an authenticated SUPER_ADMIN/SCHOOL_ADMIN, or a scheduler with `Authorization: Bearer $CRON_SECRET`. */
export async function POST(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const bearer = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  const name = req.nextUrl.searchParams.get("job") as JobName | null;
  if (secret && bearer && bearer === secret) {
    const results = name && name in JOBS ? [await runJob(name)] : await runAllJobs();
    return NextResponse.json({ data: results });
  }
  return withAuth(async () => (name && name in JOBS ? [await runJob(name)] : runAllJobs()), { permission: "workflows:manage" })(req);
}

export const GET = withAuth(async () => recentJobRuns(), { permission: "workflows:manage" });
