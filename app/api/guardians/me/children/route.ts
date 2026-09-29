import { withAuth } from "@/lib/api";
import { myChildren } from "@/modules/guardians";

export const GET = withAuth(async ({ user }) => myChildren(user));
