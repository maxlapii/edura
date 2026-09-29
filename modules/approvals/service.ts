import { prisma } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";
import type { ApprovalType } from "@/generated/prisma/enums";
import type { AuthUser } from "@/lib/auth/types";
import { assertPermission, assertSchoolAccess, hasPermission, resolveSchoolId } from "@/lib/permissions";
import { AppError } from "@/lib/utils/errors";
import { audit } from "@/lib/audit";
import { notify } from "@/lib/notifications";
import { reviewLeaveRequest } from "@/modules/leave/service";
import type { DecideApprovalInput, ListApprovalsInput } from "./schema";

const include = {
  requester: { select: { id: true, name: true, email: true, role: true } },
  approver: { select: { id: true, name: true } },
} satisfies Prisma.ApprovalInclude;

export interface CreateApprovalData {
  type: ApprovalType;
  entityType: string;
  entityId: string;
  title: string;
  requesterUserId: string;
}

/** Creates a PENDING approval row. Used by modules that need a decision (events, resource requests…). */
export async function createApproval(schoolId: string, data: CreateApprovalData, tx: Prisma.TransactionClient | typeof prisma = prisma) {
  return tx.approval.create({ data: { schoolId, ...data } });
}

export async function pendingApprovalsCount(schoolId: string) {
  return prisma.approval.count({ where: { schoolId, status: "PENDING" } });
}

/**
 * Approvers (approvals:read) see the whole school (PENDING + history);
 * everybody else sees only the approvals they requested.
 */
export async function listApprovals(user: AuthUser, input: ListApprovalsInput = {}) {
  const schoolId = resolveSchoolId(user);
  const canReadAll = hasPermission(user, "approvals:read");
  const scope = input.scope ?? (canReadAll ? "all" : "mine");
  if (scope === "all") assertPermission(user, "approvals:read");
  const where: Prisma.ApprovalWhereInput = { schoolId, status: input.status, type: input.type };
  if (scope === "mine") where.requesterUserId = user.id;
  return prisma.approval.findMany({ where, include, orderBy: [{ status: "asc" }, { createdAt: "desc" }], take: 300 });
}

export async function getApproval(user: AuthUser, id: string) {
  const approval = await prisma.approval.findUnique({ where: { id }, include });
  if (!approval) throw AppError.notFound("Approval");
  assertSchoolAccess(user, approval.schoolId);
  if (approval.requesterUserId !== user.id) assertPermission(user, "approvals:read");
  return approval;
}

/**
 * Approve or reject. The effect depends on the entity type:
 *  - LeaveRequest → delegated to the leave module (which updates the Approval row itself)
 *  - Event        → event becomes SCHEDULED / CANCELLED
 *  - anything else → only the Approval row is updated
 * The requester is always notified.
 */
export async function decideApproval(user: AuthUser, id: string, input: DecideApprovalInput) {
  assertPermission(user, "approvals:decide");
  const approval = await prisma.approval.findUnique({ where: { id }, include });
  if (!approval) throw AppError.notFound("Approval");
  assertSchoolAccess(user, approval.schoolId);
  if (approval.status !== "PENDING") throw AppError.conflict(`Approval is already ${approval.status}`);
  if (approval.requesterUserId === user.id) throw AppError.forbidden("You cannot decide your own request");

  const status = input.action === "APPROVE" ? "APPROVED" : "REJECTED";
  const comment = input.comment ?? null;
  const now = new Date();
  const decision = { status, approverUserId: user.id, decisionAt: now, comment } as const;

  if (approval.entityType === "LeaveRequest") {
    await reviewLeaveRequest(user, approval.entityId, input.action, comment);
    const updated = await prisma.approval.findUniqueOrThrow({ where: { id }, include });
    // The leave module updates the Approval row by entity; make sure this row is closed even if it was created separately.
    if (updated.status === "PENDING") {
      const fixed = await prisma.approval.update({ where: { id }, data: decision, include });
      await audit({ user, schoolId: approval.schoolId, action: `approval.${input.action.toLowerCase()}`, entityType: "Approval", entityId: id, before: approval, after: fixed });
      return fixed;
    }
    return updated;
  }

  if (approval.entityType === "Event") {
    const event = await prisma.event.findUnique({ where: { id: approval.entityId } });
    const updated = await prisma.$transaction(async (tx) => {
      if (event && event.status === "PENDING_APPROVAL") {
        await tx.event.update({ where: { id: event.id }, data: { status: status === "APPROVED" ? "SCHEDULED" : "CANCELLED" } });
      }
      return tx.approval.update({ where: { id }, data: decision, include });
    });
    await audit({ user, schoolId: approval.schoolId, action: `approval.${input.action.toLowerCase()}`, entityType: "Approval", entityId: id, before: approval, after: updated, metadata: { entityType: "Event", entityId: approval.entityId } });
    await notifyRequester(updated, comment, event ? `/events/${event.id}` : null);
    return updated;
  }

  const updated = await prisma.approval.update({ where: { id }, data: decision, include });
  await audit({ user, schoolId: approval.schoolId, action: `approval.${input.action.toLowerCase()}`, entityType: "Approval", entityId: id, before: approval, after: updated });
  await notifyRequester(updated, comment, `/approvals/${id}`);
  return updated;
}

async function notifyRequester(approval: { id: string; schoolId: string; requesterUserId: string; title: string; status: string }, comment: string | null, link: string | null) {
  const approved = approval.status === "APPROVED";
  await notify({
    schoolId: approval.schoolId,
    userId: approval.requesterUserId,
    type: "APPROVAL_DECIDED",
    title: `${approved ? "Approved" : "Not approved"}: ${approval.title}`,
    body: comment,
    link,
    email: true,
  });
}
