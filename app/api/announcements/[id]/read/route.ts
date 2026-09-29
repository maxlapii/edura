import { withAuth } from "@/lib/api";
import { announcementReadStats, markAnnouncementRead } from "@/modules/announcements";

/** Mark the announcement as read by the caller. */
export const POST = withAuth(async ({ user, params }) => markAnnouncementRead(user, params.id), { permission: "announcements:read" });

/** Read statistics (managers). */
export const GET = withAuth(async ({ user, params }) => announcementReadStats(user, params.id), { permission: "announcements:manage" });
