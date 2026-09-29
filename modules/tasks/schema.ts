import { z } from "zod";

export const createTaskSchema = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(5000).optional().nullable(),
  /** Defaults to the caller. Assigning to others requires tasks:assign. */
  assigneeUserId: z.string().optional(),
  dueDate: z.coerce.date().optional().nullable(),
  priority: z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]).default("MEDIUM"),
});
export type CreateTaskInput = z.infer<typeof createTaskSchema>;

export const updateTaskSchema = createTaskSchema.partial().extend({
  status: z.enum(["TODO", "IN_PROGRESS", "DONE", "CANCELLED"]).optional(),
});
export type UpdateTaskInput = z.infer<typeof updateTaskSchema>;

export const listTasksSchema = z.object({
  status: z.enum(["TODO", "IN_PROGRESS", "DONE", "CANCELLED", "OPEN"]).optional(),
  assigneeUserId: z.string().optional(),
  overdue: z.enum(["true", "false"]).optional(),
  scope: z.enum(["mine", "all"]).default("mine"),
});
