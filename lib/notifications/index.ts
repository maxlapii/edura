import { prisma } from "@/lib/db";
import { sendEmail } from "./email";

export type NotificationType =
  | "LEAVE_REQUESTED"
  | "LEAVE_APPROVED"
  | "LEAVE_REJECTED"
  | "SUBSTITUTE_ASSIGNED"
  | "CLASS_COVERED"
  | "STUDENT_ABSENT"
  | "ABSENCE_THRESHOLD"
  | "ASSIGNMENT_CREATED"
  | "ASSIGNMENT_OVERDUE"
  | "ASSIGNMENT_GRADED"
  | "GRADE_REMINDER"
  | "MEETING_INVITE"
  | "MEETING_REMINDER"
  | "TASK_ASSIGNED"
  | "TASK_OVERDUE"
  | "CERTIFICATION_EXPIRING"
  | "MAINTENANCE_ASSIGNED"
  | "MAINTENANCE_CREATED"
  | "ANNOUNCEMENT"
  | "MESSAGE"
  | "EVENT_CREATED"
  | "APPROVAL_REQUESTED"
  | "APPROVAL_DECIDED"
  | "REPORT_CARD_PUBLISHED"
  | "ALERT"
  | "GENERIC";

export interface NotifyInput {
  schoolId?: string | null;
  userId: string;
  type: NotificationType | string;
  title: string;
  body?: string | null;
  link?: string | null;
  /** Also send an email (in addition to the in-app notification). */
  email?: boolean;
}

/** Creates an in-app notification and optionally emails the user. */
export async function notify(input: NotifyInput) {
  const notification = await prisma.notification.create({
    data: {
      schoolId: input.schoolId ?? null,
      userId: input.userId,
      type: input.type,
      title: input.title,
      body: input.body ?? null,
      link: input.link ?? null,
      channel: "IN_APP",
    },
  });

  if (input.email) {
    const user = await prisma.user.findUnique({ where: { id: input.userId }, select: { email: true, name: true } });
    if (user?.email) {
      await sendEmail({
        to: user.email,
        subject: `[Edura] ${input.title}`,
        text: `${input.body ?? input.title}${input.link ? `\n\n${appUrl(input.link)}` : ""}`,
      });
      await prisma.notification.update({ where: { id: notification.id }, data: { emailSentAt: new Date() } });
    }
  }
  return notification;
}

export async function notifyMany(userIds: string[], input: Omit<NotifyInput, "userId">) {
  const unique = [...new Set(userIds)];
  return Promise.all(unique.map((userId) => notify({ ...input, userId })));
}

function appUrl(path: string) {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  return path.startsWith("http") ? path : `${base}${path}`;
}

export async function listNotifications(userId: string, opts: { unreadOnly?: boolean; take?: number } = {}) {
  return prisma.notification.findMany({
    where: { userId, ...(opts.unreadOnly ? { readAt: null } : {}) },
    orderBy: { createdAt: "desc" },
    take: opts.take ?? 50,
  });
}

export async function countUnread(userId: string) {
  return prisma.notification.count({ where: { userId, readAt: null } });
}

export async function markRead(userId: string, notificationId: string) {
  return prisma.notification.updateMany({ where: { id: notificationId, userId, readAt: null }, data: { readAt: new Date() } });
}

export async function markAllRead(userId: string) {
  return prisma.notification.updateMany({ where: { userId, readAt: null }, data: { readAt: new Date() } });
}

/** Resolves the user ids of a school's administrators (SCHOOL_ADMIN + PRINCIPAL). */
export async function schoolAdminUserIds(schoolId: string): Promise<string[]> {
  const admins = await prisma.user.findMany({
    where: { schoolId, role: { in: ["SCHOOL_ADMIN", "PRINCIPAL"] }, isActive: true },
    select: { id: true },
  });
  return admins.map((a) => a.id);
}
