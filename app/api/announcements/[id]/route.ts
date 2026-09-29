import { withAuth, parseBody, noContent } from "@/lib/api";
import { deleteAnnouncement, getAnnouncement, updateAnnouncement, updateAnnouncementSchema } from "@/modules/announcements";

export const GET = withAuth(async ({ user, params }) => getAnnouncement(user, params.id), { permission: "announcements:read" });

export const PATCH = withAuth(async ({ req, user, params }) => updateAnnouncement(user, params.id, await parseBody(req, updateAnnouncementSchema)), { permission: "announcements:manage" });

export const DELETE = withAuth(
  async ({ user, params }) => {
    await deleteAnnouncement(user, params.id);
    return noContent();
  },
  { permission: "announcements:manage" },
);
