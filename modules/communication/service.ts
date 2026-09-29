import { prisma } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";
import type { AuthUser } from "@/lib/auth/types";
import { assertPermission, assertSchoolAccess, isAdmin, isStaffLike, resolveSchoolId } from "@/lib/permissions";
import { AppError } from "@/lib/utils/errors";
import { audit } from "@/lib/audit";
import { notifyMany } from "@/lib/notifications";
import { formatDate } from "@/lib/utils/dates";
import { assertStudentAccess } from "@/modules/students/service";
import { renderTemplate, templateVariables } from "./templates";
import type { ListMessagesQuery, MessageRecipientsInput, MessageTemplateInput, SendMessageInput, UpdateMessageTemplateInput } from "./schema";

const senderSelect = { id: true, name: true, email: true, role: true } satisfies Prisma.UserSelect;

const messageInclude = {
  sender: { select: senderSelect },
  recipients: { include: { user: { select: { id: true, name: true, role: true } } } },
  _count: { select: { recipients: true } },
} satisfies Prisma.MessageInclude;

// ───────────── Recipient resolution ─────────────

/** Users a student or parent is allowed to message: school administrators and the teachers of their (children's) classes. */
async function allowedRecipientsForStudentLike(user: AuthUser, schoolId: string): Promise<Set<string>> {
  const classIds = new Set<string>();
  if (user.studentId) {
    const s = await prisma.student.findUnique({ where: { id: user.studentId }, select: { classId: true } });
    if (s?.classId) classIds.add(s.classId);
  } else if (user.guardianId) {
    const links = await prisma.studentGuardian.findMany({ where: { guardianId: user.guardianId }, select: { student: { select: { classId: true } } } });
    for (const l of links) if (l.student.classId) classIds.add(l.student.classId);
  }
  const ids = [...classIds];
  const [admins, courses, classes] = await Promise.all([
    prisma.user.findMany({ where: { schoolId, role: { in: ["SCHOOL_ADMIN", "PRINCIPAL"] }, isActive: true }, select: { id: true } }),
    ids.length ? prisma.course.findMany({ where: { classId: { in: ids } }, select: { teacher: { select: { userId: true } } } }) : Promise.resolve([]),
    ids.length ? prisma.schoolClass.findMany({ where: { id: { in: ids } }, select: { homeroomTeacher: { select: { userId: true } } } }) : Promise.resolve([]),
  ]);
  const allowed = new Set<string>(admins.map((a) => a.id));
  for (const c of courses) allowed.add(c.teacher.userId);
  for (const c of classes) if (c.homeroomTeacher) allowed.add(c.homeroomTeacher.userId);
  return allowed;
}

/**
 * Expands a recipient specification into user ids of the caller's school and
 * enforces who each role may write to. Never includes the sender.
 */
export async function resolveMessageRecipients(user: AuthUser, schoolId: string, spec: MessageRecipientsInput): Promise<string[]> {
  const ids = new Set<string>();
  const staffLike = isStaffLike(user);
  if ((spec.classId || spec.departmentId || spec.audience) && !staffLike) throw AppError.forbidden("Students and parents can only message individual users");
  if (spec.audience && !isAdmin(user)) throw AppError.forbidden("Only administrators can message a whole audience");

  if (spec.userIds?.length) {
    const unique = [...new Set(spec.userIds)];
    const users = await prisma.user.findMany({ where: { id: { in: unique }, schoolId, isActive: true }, select: { id: true } });
    if (users.length !== unique.length) throw AppError.validation("All recipients must be active users of the same school");
    for (const u of users) ids.add(u.id);
  }
  if (spec.classId) {
    const cls = await prisma.schoolClass.findUnique({ where: { id: spec.classId }, select: { schoolId: true } });
    if (!cls || cls.schoolId !== schoolId) throw AppError.validation("Class must belong to the same school");
    const students = await prisma.student.findMany({
      where: { classId: spec.classId, status: "ACTIVE" },
      select: { userId: true, guardians: { select: { guardian: { select: { userId: true } } } } },
    });
    for (const s of students) {
      if (s.userId) ids.add(s.userId);
      for (const g of s.guardians) ids.add(g.guardian.userId);
    }
  }
  if (spec.departmentId) {
    const dept = await prisma.department.findUnique({ where: { id: spec.departmentId }, select: { schoolId: true } });
    if (!dept || dept.schoolId !== schoolId) throw AppError.validation("Department must belong to the same school");
    const teachers = await prisma.teacher.findMany({ where: { departmentId: spec.departmentId, status: { in: ["ACTIVE", "ON_LEAVE"] } }, select: { userId: true } });
    for (const t of teachers) ids.add(t.userId);
  }
  if (spec.audience) {
    const roles: Prisma.UserWhereInput["role"] =
      spec.audience === "TEACHERS" ? { in: ["TEACHER", "DEPARTMENT_HEAD"] } : spec.audience === "STAFF" ? "STAFF" : spec.audience === "PARENTS" ? "PARENT" : "STUDENT";
    const users = await prisma.user.findMany({ where: { schoolId, role: roles, isActive: true }, select: { id: true } });
    for (const u of users) ids.add(u.id);
  }
  ids.delete(user.id);

  if (!staffLike) {
    const allowed = await allowedRecipientsForStudentLike(user, schoolId);
    for (const id of ids) {
      if (!allowed.has(id)) throw AppError.forbidden("You can only message your teachers and school administrators");
    }
  }
  if (ids.size === 0) throw AppError.validation("No recipients resolved");
  return [...ids];
}

// ───────────── Messages ─────────────

export async function sendMessage(user: AuthUser, input: SendMessageInput) {
  assertPermission(user, "messages:send");
  const schoolId = resolveSchoolId(user);
  const recipientIds = await resolveMessageRecipients(user, schoolId, input.recipients);
  let threadId: string | null = null;
  if (input.threadId) {
    const root = await prisma.message.findUnique({ where: { id: input.threadId }, select: { id: true, schoolId: true, senderUserId: true, recipients: { select: { userId: true } } } });
    if (!root || root.schoolId !== schoolId) throw AppError.validation("Thread not found");
    if (root.senderUserId !== user.id && !root.recipients.some((r) => r.userId === user.id)) throw AppError.forbidden("You are not part of this thread");
    threadId = root.id;
  }
  const message = await prisma.$transaction(async (tx) => {
    const m = await tx.message.create({ data: { schoolId, senderUserId: user.id, subject: input.subject, body: input.body, threadId } });
    await tx.messageRecipient.createMany({ data: recipientIds.map((userId) => ({ messageId: m.id, userId })) });
    return tx.message.findUniqueOrThrow({ where: { id: m.id }, include: messageInclude });
  });
  await audit({ user, schoolId, action: "message.send", entityType: "Message", entityId: message.id, metadata: { subject: message.subject, recipients: recipientIds.length, threadId } });
  await notifyMany(recipientIds, {
    schoolId,
    type: "MESSAGE",
    title: `New message from ${user.name}: ${message.subject}`,
    body: message.body.length > 200 ? `${message.body.slice(0, 200)}…` : message.body,
    link: `/messages/${message.id}`,
  });
  return message;
}

export async function inbox(user: AuthUser, opts: { unreadOnly?: boolean } = {}) {
  assertPermission(user, "messages:read");
  const items = await prisma.message.findMany({
    where: { recipients: { some: { userId: user.id, ...(opts.unreadOnly ? { readAt: null } : {}) } } },
    include: { sender: { select: senderSelect }, recipients: { where: { userId: user.id }, select: { readAt: true } }, _count: { select: { recipients: true } } },
    orderBy: { createdAt: "desc" },
    take: 200,
  });
  return items.map(({ recipients, ...m }) => ({ ...m, readAt: recipients[0]?.readAt ?? null }));
}

export async function sent(user: AuthUser) {
  assertPermission(user, "messages:read");
  return prisma.message.findMany({ where: { senderUserId: user.id }, include: messageInclude, orderBy: { createdAt: "desc" }, take: 200 });
}

export async function listMessages(user: AuthUser, query: ListMessagesQuery) {
  return query.box === "sent" ? sent(user) : inbox(user, { unreadOnly: query.unreadOnly === "true" });
}

/** Sender or recipient may read a message; reading marks it as read for a recipient. */
export async function getMessage(user: AuthUser, id: string) {
  assertPermission(user, "messages:read");
  const message = await prisma.message.findUnique({ where: { id }, include: messageInclude });
  if (!message) throw AppError.notFound("Message");
  assertSchoolAccess(user, message.schoolId);
  const receipt = message.recipients.find((r) => r.userId === user.id);
  if (message.senderUserId !== user.id && !receipt) throw AppError.forbidden();
  if (receipt && !receipt.readAt) {
    await prisma.messageRecipient.update({ where: { id: receipt.id }, data: { readAt: new Date() } });
    receipt.readAt = new Date();
  }
  const thread = message.threadId
    ? await prisma.message.findMany({
        where: { OR: [{ id: message.threadId }, { threadId: message.threadId }], NOT: { id }, AND: [{ OR: [{ senderUserId: user.id }, { recipients: { some: { userId: user.id } } }] }] },
        include: { sender: { select: senderSelect } },
        orderBy: { createdAt: "asc" },
      })
    : [];
  return { ...message, readAt: receipt?.readAt ?? null, thread };
}

export async function markRead(user: AuthUser, id: string) {
  assertPermission(user, "messages:read");
  const res = await prisma.messageRecipient.updateMany({ where: { messageId: id, userId: user.id, readAt: null }, data: { readAt: new Date() } });
  return { updated: res.count };
}

export async function unreadCount(userId: string) {
  return prisma.messageRecipient.count({ where: { userId, readAt: null } });
}

// ───────────── Templates ─────────────

function assertTemplateAccess(user: AuthUser) {
  assertPermission(user, "messages:send");
  if (!isStaffLike(user)) throw AppError.forbidden("Message templates are only available to school staff");
}

export async function listTemplates(user: AuthUser, query: { category?: string } = {}) {
  assertTemplateAccess(user);
  const schoolId = resolveSchoolId(user);
  const items = await prisma.messageTemplate.findMany({ where: { schoolId, category: query.category }, orderBy: [{ category: "asc" }, { name: "asc" }] });
  return items.map((t) => ({ ...t, variables: templateVariables(`${t.subject} ${t.body}`) }));
}

export async function createTemplate(user: AuthUser, input: MessageTemplateInput) {
  assertTemplateAccess(user);
  const schoolId = resolveSchoolId(user);
  const t = await prisma.messageTemplate.create({ data: { schoolId, ...input } });
  await audit({ user, schoolId, action: "message_template.create", entityType: "MessageTemplate", entityId: t.id, after: t });
  return t;
}

async function loadTemplate(user: AuthUser, id: string) {
  const t = await prisma.messageTemplate.findUnique({ where: { id } });
  if (!t) throw AppError.notFound("Message template");
  assertSchoolAccess(user, t.schoolId);
  return t;
}

export async function updateTemplate(user: AuthUser, id: string, input: UpdateMessageTemplateInput) {
  assertTemplateAccess(user);
  const before = await loadTemplate(user, id);
  const t = await prisma.messageTemplate.update({ where: { id }, data: input });
  await audit({ user, schoolId: before.schoolId, action: "message_template.update", entityType: "MessageTemplate", entityId: id, before, after: t });
  return t;
}

export async function deleteTemplate(user: AuthUser, id: string) {
  assertTemplateAccess(user);
  const before = await loadTemplate(user, id);
  await prisma.messageTemplate.delete({ where: { id } });
  await audit({ user, schoolId: before.schoolId, action: "message_template.delete", entityType: "MessageTemplate", entityId: id, before });
}

/** Renders a template for a specific student with studentName, className, teacherName and date. */
export async function renderTemplateForStudent(user: AuthUser, templateId: string, studentId: string) {
  assertTemplateAccess(user);
  const template = await loadTemplate(user, templateId);
  await assertStudentAccess(user, studentId);
  const student = await prisma.student.findUniqueOrThrow({
    where: { id: studentId },
    select: { firstName: true, lastName: true, class: { select: { name: true, homeroomTeacher: { select: { user: { select: { name: true } } } } } } },
  });
  const teacherName = user.teacherId ? user.name : (student.class?.homeroomTeacher?.user.name ?? user.name);
  const vars = {
    studentName: `${student.firstName} ${student.lastName}`,
    className: student.class?.name ?? "",
    teacherName,
    date: formatDate(new Date()),
  };
  return { templateId, studentId, vars, subject: renderTemplate(template.subject, vars), body: renderTemplate(template.body, vars) };
}
