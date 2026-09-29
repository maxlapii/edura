import { withAuth, parseBody, parseQuery, created } from "@/lib/api";
import { createEvent, createEventSchema, listEvents, listEventsSchema } from "@/modules/events";

export const GET = withAuth(async ({ req, user }) => listEvents(user, parseQuery(req, listEventsSchema)), { permission: "events:read" });

export const POST = withAuth(async ({ req, user }) => created(await createEvent(user, await parseBody(req, createEventSchema))), { permission: "events:manage" });
