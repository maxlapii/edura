import { withAuth, parseBody, parseQuery, created } from "@/lib/api";
import { createIncident, createIncidentSchema, listIncidents, listIncidentsSchema } from "@/modules/discipline";

// Students/parents may list their own student's incidents, so the coarse check lives in the service.
export const GET = withAuth(async ({ req, user }) => listIncidents(user, parseQuery(req, listIncidentsSchema)));

export const POST = withAuth(async ({ req, user }) => created(await createIncident(user, await parseBody(req, createIncidentSchema))), { permission: "discipline:manage" });
