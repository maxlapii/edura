import { describe, expect, it } from "vitest";
import { emailOutbox } from "../../setup/integration";
import { createSchoolFixture, signIn, api, prisma } from "../helpers";
import { countUnread, listNotifications, markAllRead, markRead, notify, notifyMany, schoolAdminUserIds } from "@/lib/notifications";
import { GET as listRoute } from "@/app/api/notifications/route";
import { POST as readRoute } from "@/app/api/notifications/[id]/read/route";
import { POST as readAllRoute } from "@/app/api/notifications/read-all/route";

describe("notifications", () => {
  it("notify() creates an in-app row and, when asked, sends an email and stamps emailSentAt", async () => {
    const f = await createSchoolFixture();
    emailOutbox.sent.length = 0;
    const plain = await notify({ schoolId: f.school.id, userId: f.teacher.user.id, type: "GENERIC", title: "Plain", body: "No mail" });
    expect(plain).toMatchObject({ userId: f.teacher.user.id, type: "GENERIC", title: "Plain", body: "No mail", link: null, channel: "IN_APP", readAt: null, emailSentAt: null });
    expect(emailOutbox.sent).toHaveLength(0);

    const mailed = await notify({ schoolId: f.school.id, userId: f.teacher.user.id, type: "LEAVE_APPROVED", title: "Approved", body: "Enjoy", link: "/leave/1", email: true });
    const stored = await prisma.notification.findUniqueOrThrow({ where: { id: mailed.id } });
    expect(stored.emailSentAt).toBeInstanceOf(Date);
    expect(emailOutbox.sent).toHaveLength(1);
    expect(emailOutbox.sent[0]).toEqual({ to: f.teacher.user.email, subject: "[Edura] Approved", text: "Enjoy\n\nhttp://localhost:3000/leave/1" });
    // no body → title is used as the text
    await notify({ userId: f.teacher.user.id, type: "GENERIC", title: "Only title", email: true });
    expect(emailOutbox.sent[1].text).toBe("Only title");
    expect(await countUnread(f.teacher.user.id)).toBe(3);
  });

  it("notifyMany de-duplicates recipients", async () => {
    const f = await createSchoolFixture();
    const rows = await notifyMany([f.teacher.user.id, f.teacher.user.id, f.teacher2.user.id, f.teacher.user.id], { schoolId: f.school.id, type: "ANNOUNCEMENT", title: "Staff meeting" });
    expect(rows).toHaveLength(2);
    expect(await prisma.notification.count({ where: { title: "Staff meeting" } })).toBe(2);
    expect(await countUnread(f.teacher.user.id)).toBe(1);
    expect(await countUnread(f.teacher2.user.id)).toBe(1);
    expect(new Set(await schoolAdminUserIds(f.school.id))).toEqual(new Set([f.adminUser.id, f.principal.id]));
  });

  it("list / mark read / mark all read through the routes; users cannot touch others' notifications", async () => {
    const f = await createSchoolFixture();
    const mine1 = await notify({ userId: f.teacher.user.id, type: "GENERIC", title: "one" });
    const mine2 = await notify({ userId: f.teacher.user.id, type: "GENERIC", title: "two" });
    const mine3 = await notify({ userId: f.teacher.user.id, type: "GENERIC", title: "three" });
    const theirs = await notify({ userId: f.teacher2.user.id, type: "GENERIC", title: "not mine" });
    const cookie = await signIn(f.teacher.user.email);
    const otherCookie = await signIn(f.teacher2.user.email);

    expect((await api(listRoute)).status).toBe(401);
    const list = await api(listRoute, { cookie });
    expect(list.status).toBe(200);
    expect(list.data).toMatchObject({ unread: 3 });
    const items = (list.data as { items: Array<{ id: string; userId: string }> }).items;
    expect(new Set(items.map((n) => n.id))).toEqual(new Set([mine1.id, mine2.id, mine3.id]));
    expect(items.every((n) => n.userId === f.teacher.user.id)).toBe(true);

    const read = await api(readRoute, { cookie, method: "POST", params: { id: mine1.id } });
    expect(read.status).toBe(200);
    expect(read.data).toEqual({ count: 1 });
    expect((await prisma.notification.findUniqueOrThrow({ where: { id: mine1.id } })).readAt).toBeInstanceOf(Date);
    // marking again is a no-op
    expect((await api(readRoute, { cookie, method: "POST", params: { id: mine1.id } })).data).toEqual({ count: 0 });

    // another user's notification: nothing happens
    const foreign = await api(readRoute, { cookie, method: "POST", params: { id: theirs.id } });
    expect(foreign.status).toBe(200);
    expect(foreign.data).toEqual({ count: 0 });
    expect((await prisma.notification.findUniqueOrThrow({ where: { id: theirs.id } })).readAt).toBeNull();
    expect(await markRead(f.teacher.user.id, theirs.id)).toEqual({ count: 0 });

    const unreadOnly = await api(listRoute, { cookie, query: { unreadOnly: "true" } });
    expect(new Set((unreadOnly.data as { items: Array<{ id: string }>; unread: number }).items.map((n) => n.id))).toEqual(new Set([mine2.id, mine3.id]));
    expect((unreadOnly.data as { unread: number }).unread).toBe(2);

    const all = await api(readAllRoute, { cookie, method: "POST" });
    expect(all.status).toBe(200);
    expect(all.data).toEqual({ count: 2 });
    expect(await countUnread(f.teacher.user.id)).toBe(0);
    expect(await listNotifications(f.teacher.user.id, { unreadOnly: true })).toEqual([]);
    expect(await listNotifications(f.teacher.user.id)).toHaveLength(3);
    // teacher2's notification is untouched by teacher's read-all
    expect(await countUnread(f.teacher2.user.id)).toBe(1);
    expect((await api(listRoute, { cookie: otherCookie })).data).toMatchObject({ unread: 1 });
    expect(await markAllRead(f.teacher2.user.id)).toEqual({ count: 1 });
  });
});
