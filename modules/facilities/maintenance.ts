/**
 * Pure maintenance-request state machine helpers.
 */
import type { MaintenanceStatus } from "@/generated/prisma/enums";

export const MAINTENANCE_TRANSITIONS: Record<MaintenanceStatus, readonly MaintenanceStatus[]> = {
  OPEN: ["ASSIGNED", "IN_PROGRESS", "CLOSED"],
  ASSIGNED: ["IN_PROGRESS", "OPEN", "CLOSED"],
  IN_PROGRESS: ["RESOLVED", "ASSIGNED"],
  RESOLVED: ["CLOSED", "IN_PROGRESS"],
  CLOSED: [],
};

export const MAINTENANCE_FINAL_STATUSES: readonly MaintenanceStatus[] = ["RESOLVED", "CLOSED"];

export function canTransition(from: MaintenanceStatus, to: MaintenanceStatus): boolean {
  return MAINTENANCE_TRANSITIONS[from]?.includes(to) ?? false;
}

/** A request is overdue when it has a due date in the past and is not yet resolved/closed. */
export function isOverdue(req: { dueDate: Date | string | null | undefined; status: MaintenanceStatus }, now: Date = new Date()): boolean {
  if (!req.dueDate) return false;
  if (MAINTENANCE_FINAL_STATUSES.includes(req.status)) return false;
  const due = typeof req.dueDate === "string" ? new Date(req.dueDate) : req.dueDate;
  return due.getTime() < now.getTime();
}
