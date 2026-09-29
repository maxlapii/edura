import { withAuth } from "@/lib/api";
import { suggestSubstitutes } from "@/modules/substitution";

export const GET = withAuth(async ({ user, params }) => suggestSubstitutes(user, params.id), { permission: "substitution:manage" });
