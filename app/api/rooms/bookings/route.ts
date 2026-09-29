import { withAuth, parseBody, parseQuery, created } from "@/lib/api";
import { createBooking, createBookingSchema, listBookings, listBookingsSchema } from "@/modules/facilities";

export const GET = withAuth(async ({ req, user }) => listBookings(user, parseQuery(req, listBookingsSchema)), { permission: "rooms:read" });

export const POST = withAuth(async ({ req, user }) => created(await createBooking(user, await parseBody(req, createBookingSchema))), { permission: "rooms:book" });
