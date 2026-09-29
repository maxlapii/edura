import { withAuth, parseBody, created } from "@/lib/api";
import { bulkSlotsSchema, createSlots } from "@/modules/timetable";

export const POST = withAuth(async ({ req, user }) => created(await createSlots(user, (await parseBody(req, bulkSlotsSchema)).slots)), { permission: "timetable:manage" });
