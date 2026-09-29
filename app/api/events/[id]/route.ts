import { withAuth, parseBody } from "@/lib/api";
import { cancelEvent, getEvent, updateEvent, updateEventSchema } from "@/modules/events";

export const GET = withAuth(async ({ user, params }) => getEvent(user, params.id), { permission: "events:read" });

export const PATCH = withAuth(async ({ req, user, params }) => updateEvent(user, params.id, await parseBody(req, updateEventSchema)), { permission: "events:manage" });

export const DELETE = withAuth(async ({ user, params }) => cancelEvent(user, params.id), { permission: "events:manage" });
