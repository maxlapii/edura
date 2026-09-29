import { withAuth } from "@/lib/api";
import { AI_MODEL, isAiConfigured } from "@/lib/ai/client";
import { toolsForUser } from "@/lib/ai/tools";

/** Whether the assistant is configured, which model it uses and which tools the caller may use. */
export const GET = withAuth(async ({ user }) => ({ configured: isAiConfigured(), model: AI_MODEL, tools: toolsForUser(user).map((t) => t.name) }), { permission: ["ai:teacher", "ai:admin"] });
