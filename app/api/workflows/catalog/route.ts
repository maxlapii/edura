import { withAuth } from "@/lib/api";
import { workflowCatalog } from "@/modules/workflows";

export const GET = withAuth(async () => workflowCatalog(), { permission: "workflows:manage" });
