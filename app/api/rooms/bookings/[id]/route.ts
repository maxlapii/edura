import { withAuth } from "@/lib/api";
import { cancelBooking } from "@/modules/facilities";

export const DELETE = withAuth(async ({ user, params }) => cancelBooking(user, params.id), { permission: "rooms:book" });
