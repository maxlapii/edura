import { z } from "zod";

export const idSchema = z.string().min(1).max(64);
export const emailSchema = z.string().trim().toLowerCase().email().max(254);
export const passwordSchema = z.string().min(8).max(128);

/** Accepts "YYYY-MM-DD" or ISO datetime and produces a Date. */
export const dateSchema = z.coerce.date();
export const dateOnlySchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD")
  .transform((s) => new Date(`${s}T00:00:00.000Z`));

export const timeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Expected HH:MM");
export const dayOfWeekSchema = z.coerce.number().int().min(1).max(7);

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(25),
});
export type Pagination = z.infer<typeof paginationSchema>;

export function paginate<T extends Pagination>(p: T) {
  return { skip: (p.page - 1) * p.pageSize, take: p.pageSize };
}

export interface Paged<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export function paged<T>(items: T[], total: number, p: Pagination): Paged<T> {
  return { items, total, page: p.page, pageSize: p.pageSize, totalPages: Math.max(1, Math.ceil(total / p.pageSize)) };
}

export const searchSchema = paginationSchema.extend({
  q: z.string().trim().max(200).optional(),
});

export function optionalTrimmed(max = 2000) {
  return z.string().trim().max(max).optional().nullable();
}
