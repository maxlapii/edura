import { withAuth } from "@/lib/api";
import { getUserProfile } from "@/modules/users";

export const GET = withAuth(async ({ user }) => getUserProfile(user));
