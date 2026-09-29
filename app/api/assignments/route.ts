import { withAuth, parseBody, parseQuery, created } from "@/lib/api";
import { assignmentFilterSchema, createAssignment, createAssignmentSchema, listAssignments } from "@/modules/assignments";

export const GET = withAuth(async ({ req, user }) => listAssignments(user, parseQuery(req, assignmentFilterSchema)), { permission: "assignments:read" });

export const POST = withAuth(async ({ req, user }) => created(await createAssignment(user, await parseBody(req, createAssignmentSchema))), { permission: "assignments:manage" });
