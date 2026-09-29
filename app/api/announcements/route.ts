import { withAuth, parseBody, parseQuery, created } from "@/lib/api";
import { createAnnouncement, createAnnouncementSchema, listAnnouncementsForUser, listAnnouncementsSchema } from "@/modules/announcements";

export const GET = withAuth(async ({ req, user }) => listAnnouncementsForUser(user, parseQuery(req, listAnnouncementsSchema)), { permission: "announcements:read" });

export const POST = withAuth(async ({ req, user }) => created(await createAnnouncement(user, await parseBody(req, createAnnouncementSchema))), { permission: "announcements:manage" });
