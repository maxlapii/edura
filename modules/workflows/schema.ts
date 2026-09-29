import { z } from "zod";
import { WorkflowTrigger } from "@/generated/prisma/enums";
import { actionsSchema, conditionsSchema } from "@/lib/workflows/rules";

export const workflowTriggerSchema = z.enum(WorkflowTrigger);

export const createRuleSchema = z.object({
  name: z.string().trim().min(1).max(160),
  description: z.string().trim().max(2000).optional().nullable(),
  trigger: workflowTriggerSchema,
  conditions: conditionsSchema,
  actions: actionsSchema.min(1),
  isActive: z.boolean().default(true),
});
export type CreateRuleInput = z.infer<typeof createRuleSchema>;

export const updateRuleSchema = z.object({
  name: z.string().trim().min(1).max(160).optional(),
  description: z.string().trim().max(2000).optional().nullable(),
  trigger: workflowTriggerSchema.optional(),
  conditions: conditionsSchema.optional(),
  actions: actionsSchema.min(1).optional(),
  isActive: z.boolean().optional(),
});
export type UpdateRuleInput = z.infer<typeof updateRuleSchema>;

export const listRulesSchema = z.object({
  trigger: workflowTriggerSchema.optional(),
  isActive: z.enum(["true", "false"]).optional(),
});
export type ListRulesQuery = z.infer<typeof listRulesSchema>;

export const listRunsSchema = z.object({
  trigger: workflowTriggerSchema.optional(),
  status: z.enum(["SUCCESS", "SKIPPED", "FAILED"]).optional(),
  ruleId: z.string().optional(),
});
export type ListRunsQuery = z.infer<typeof listRunsSchema>;

export const testRuleSchema = z.object({
  payload: z.record(z.string(), z.unknown()).default({}),
});
export type TestRuleInput = z.infer<typeof testRuleSchema>;
