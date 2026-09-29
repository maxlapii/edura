import { z } from "zod";
import { dateOnlySchema } from "@/lib/validation";

/** Maximum calendar range in (inclusive) days. */
export const MAX_CALENDAR_DAYS = 62;

export const calendarQuerySchema = z.object({
  /** Defaults to today. */
  from: dateOnlySchema.optional(),
  /** Defaults to from + 6 days (one week). */
  to: dateOnlySchema.optional(),
  kinds: z
    .union([z.string(), z.array(z.string())])
    .optional()
    .transform((v) => (v === undefined ? undefined : (Array.isArray(v) ? v : v.split(",")).map((s) => s.trim()).filter(Boolean))),
});
export type CalendarQuery = z.infer<typeof calendarQuerySchema>;
