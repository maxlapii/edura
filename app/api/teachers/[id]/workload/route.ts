import { withAuth } from "@/lib/api";
import { teacherWorkload } from "@/modules/timetable";

export const GET = withAuth(async ({ user, params }) => teacherWorkload(user, params.id), { permission: "workload:read" });
