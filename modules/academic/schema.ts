import { z } from "zod";
import { dateOnlySchema } from "@/lib/validation";

export const createAcademicYearSchema = z
  .object({
    name: z.string().trim().min(2).max(60),
    startDate: dateOnlySchema,
    endDate: dateOnlySchema,
    isCurrent: z.boolean().default(false),
    schoolId: z.string().optional(),
  })
  .refine((v) => v.endDate > v.startDate, { message: "endDate must be after startDate", path: ["endDate"] });
export type CreateAcademicYearInput = z.infer<typeof createAcademicYearSchema>;

export const updateAcademicYearSchema = z.object({
  name: z.string().trim().min(2).max(60).optional(),
  startDate: dateOnlySchema.optional(),
  endDate: dateOnlySchema.optional(),
  isCurrent: z.boolean().optional(),
});

export const createTermSchema = z
  .object({
    academicYearId: z.string().min(1),
    name: z.string().trim().min(1).max(60),
    startDate: dateOnlySchema,
    endDate: dateOnlySchema,
    isCurrent: z.boolean().default(false),
  })
  .refine((v) => v.endDate > v.startDate, { message: "endDate must be after startDate", path: ["endDate"] });
export type CreateTermInput = z.infer<typeof createTermSchema>;

export const updateTermSchema = z.object({
  name: z.string().trim().min(1).max(60).optional(),
  startDate: dateOnlySchema.optional(),
  endDate: dateOnlySchema.optional(),
  isCurrent: z.boolean().optional(),
});
