import { withAuth } from "@/lib/api";
import { schoolWorkload } from "@/modules/timetable";

export const GET = withAuth(async ({ user }) => schoolWorkload(user), { permission: "workload:read" });
