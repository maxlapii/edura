import { withAuth, parseQuery } from "@/lib/api";
import { roomAvailability, roomAvailabilitySchema } from "@/modules/facilities";

export const GET = withAuth(async ({ req, user }) => roomAvailability(user, parseQuery(req, roomAvailabilitySchema)), { permission: "rooms:read" });
