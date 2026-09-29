import { describe, expect, it } from "vitest";
import { createSchoolFixture, createOtherSchool, createStudent, createTeacher, createUser, asUser, signIn, api, prisma } from "../helpers";
import { announcementReadStats, createAnnouncement, deleteAnnouncement, getAnnouncement, listAnnouncementsForUser, markAnnouncementRead, recentAnnouncementsForUser, updateAnnouncement } from "@/modules/announcements/service";
import { POST as postAnnouncement, GET as getAnnouncements } from "@/app/api/announcements/route";
import { POST as markReadRoute, GET as readStatsRoute } from "@/app/api/announcements/[id]/read/route";

const DAY = 86_400_000;
const body = { body: "Please read this.", priority: "NORMAL" as const, attachments: [] };

describe("announcements", () => {
  it("SCHOOL announcement is visible to everyone as unread; markRead flips it and read stats count it", async () => {
    const f = await createSchoolFixture();
    const staff = await createUser("STAFF", f.school.id);
    const res = await api(postAnnouncement, { cookie: await signIn(f.adminUser.email), body: { title: "Welcome back", body: "New term starts Monday.", audience: "SCHOOL", priority: "HIGH" } });
    expect(res.status).toBe(201);
    const a = res.data as { id: string; read: boolean; readCount: number; audience: string };
    expect(a).toMatchObject({ audience: "SCHOOL", read: false, readCount: 0 });

    for (const viewer of [f.teacher.auth, f.teacher2.auth, f.students[0].auth!, f.guardian.auth, await asUser(staff.id), f.principal]) {
      const list = await listAnnouncementsForUser(viewer);
      expect(list.map((x) => x.id)).toEqual([a.id]);
      expect(list[0].read).toBe(false);
    }
    // recipients (every active user of the school except the author) were notified
    const userCount = await prisma.user.count({ where: { schoolId: f.school.id, isActive: true } });
    const notes = await prisma.notification.findMany({ where: { type: "ANNOUNCEMENT", link: `/announcements/${a.id}` } });
    expect(notes).toHaveLength(userCount - 1);
    expect(notes.some((n) => n.userId === f.adminUser.id)).toBe(false);
    expect(notes[0].title).toBe("Welcome back");

    // teacher marks it read
    const read = await api(markReadRoute, { cookie: await signIn(f.teacher.user.email), params: { id: a.id } });
    expect(read.status).toBe(200);
    expect(read.data).toMatchObject({ announcementId: a.id, read: true });
    expect((await listAnnouncementsForUser(f.teacher.auth))[0].read).toBe(true);
    expect((await listAnnouncementsForUser(f.teacher.auth, { unreadOnly: "true" })).length).toBe(0);
    expect((await listAnnouncementsForUser(f.teacher2.auth))[0].read).toBe(false);
    expect((await getAnnouncement(f.teacher.auth, a.id)).read).toBe(true);
    // idempotent
    await markAnnouncementRead(f.teacher.auth, a.id);
    expect(await prisma.announcementRead.count({ where: { announcementId: a.id } })).toBe(1);

    const stats = await api(readStatsRoute, { cookie: await signIn(f.adminUser.email), params: { id: a.id } });
    expect(stats.status).toBe(200);
    expect(stats.data).toMatchObject({ announcementId: a.id, readCount: 1, recipientCount: userCount - 1 });
    expect((stats.data as { readers: Array<{ userId: string }> }).readers.map((r) => r.userId)).toEqual([f.teacher.user.id]);
    expect((stats.data as { readRate: number }).readRate).toBeCloseTo(Math.round((1 / (userCount - 1)) * 1000) / 10, 5);
    // read stats are for managers only
    expect((await api(readStatsRoute, { cookie: await signIn(f.teacher.user.email), params: { id: a.id } })).status).toBe(403);
    // managers see readCount in lists; others do not
    expect((await listAnnouncementsForUser(f.admin))[0].readCount).toBe(1);
    expect((await listAnnouncementsForUser(f.teacher2.auth))[0].readCount).toBeUndefined();
  });

  it("TEACHERS audience is hidden from students and parents", async () => {
    const f = await createSchoolFixture();
    const a = await createAnnouncement(f.admin, { title: "Staff only", audience: "TEACHERS", ...body });
    expect((await listAnnouncementsForUser(f.teacher.auth)).map((x) => x.id)).toEqual([a.id]);
    expect(await listAnnouncementsForUser(f.students[0].auth!)).toEqual([]);
    expect(await listAnnouncementsForUser(f.guardian.auth)).toEqual([]);
    await expect(getAnnouncement(f.students[0].auth!, a.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(markAnnouncementRead(f.guardian.auth, a.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
    const staff = await asUser((await createUser("STAFF", f.school.id)).id);
    expect(await listAnnouncementsForUser(staff)).toEqual([]);
    // notified: teachers, department heads and admins only
    const notes = await prisma.notification.findMany({ where: { type: "ANNOUNCEMENT" } });
    expect(notes.map((n) => n.userId).sort()).toEqual([f.teacher.user.id, f.teacher2.user.id, f.principal.id].sort());
    const res = await api(getAnnouncements, { cookie: await signIn(f.students[0].user!.email) });
    expect(res.status).toBe(200);
    expect(res.data).toEqual([]);
  });

  it("CLASS audience reaches the class's students, their guardians and the class teacher only", async () => {
    const f = await createSchoolFixture();
    const otherClass = await prisma.schoolClass.create({ data: { schoolId: f.school.id, academicYearId: f.year.id, name: "10B" } });
    const outsider = await createStudent(f.school.id, otherClass.id);
    const a = await createAnnouncement(f.admin, { title: "10A field trip", audience: "CLASS", targetId: f.cls.id, ...body });

    expect((await listAnnouncementsForUser(f.students[0].auth!)).map((x) => x.id)).toEqual([a.id]);
    expect((await listAnnouncementsForUser(f.students[2].auth!)).map((x) => x.id)).toEqual([a.id]);
    expect((await listAnnouncementsForUser(f.guardian.auth)).map((x) => x.id)).toEqual([a.id]);
    expect((await listAnnouncementsForUser(f.teacher.auth)).map((x) => x.id)).toEqual([a.id]);
    expect(await listAnnouncementsForUser(outsider.auth!)).toEqual([]);
    // teacher2 teaches nothing in 10A
    expect(await listAnnouncementsForUser(f.teacher2.auth)).toEqual([]);
    await expect(getAnnouncement(outsider.auth!, a.id)).rejects.toMatchObject({ code: "NOT_FOUND" });

    const notes = await prisma.notification.findMany({ where: { type: "ANNOUNCEMENT" } });
    expect(notes.map((n) => n.userId).sort()).toEqual([...f.students.map((s) => s.user!.id), f.guardian.user.id, f.teacher.user.id].sort());

    // the class must belong to the school
    const other = await createOtherSchool();
    await expect(createAnnouncement(f.admin, { title: "x", audience: "CLASS", targetId: other.cls.id, ...body })).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    const missing = await api(postAnnouncement, { cookie: await signIn(f.adminUser.email), body: { title: "x", body: "y", audience: "CLASS" } });
    expect(missing.status).toBe(422);
  });

  it("DEPARTMENT audience is visible to that department's teachers only", async () => {
    const f = await createSchoolFixture();
    const science = await prisma.department.create({ data: { schoolId: f.school.id, name: "Science", code: "SCI" } });
    const scienceTeacher = await createTeacher(f.school.id, { departmentId: science.id });
    const a = await createAnnouncement(f.admin, { title: "Maths meeting", audience: "DEPARTMENT", targetId: f.department.id, ...body });

    expect((await listAnnouncementsForUser(f.teacher.auth)).map((x) => x.id)).toEqual([a.id]);
    expect((await listAnnouncementsForUser(f.teacher2.auth)).map((x) => x.id)).toEqual([a.id]);
    expect(await listAnnouncementsForUser(scienceTeacher.auth)).toEqual([]);
    expect(await listAnnouncementsForUser(f.students[0].auth!)).toEqual([]);
    expect(await listAnnouncementsForUser(f.guardian.auth)).toEqual([]);
    const notes = await prisma.notification.findMany({ where: { type: "ANNOUNCEMENT" } });
    expect(notes.map((n) => n.userId).sort()).toEqual([f.teacher.user.id, f.teacher2.user.id].sort());
    // department-scoped staff see it as well
    const staffUser = await createUser("STAFF", f.school.id);
    await prisma.staff.create({ data: { schoolId: f.school.id, userId: staffUser.id, employeeNumber: "ST-1", departmentId: f.department.id } });
    expect((await listAnnouncementsForUser(await asUser(staffUser.id))).map((x) => x.id)).toEqual([a.id]);
  });

  it("department heads may only announce to their own department (or classes)", async () => {
    const f = await createSchoolFixture();
    const science = await prisma.department.create({ data: { schoolId: f.school.id, name: "Science", code: "SCI" } });
    await prisma.department.update({ where: { id: f.department.id }, data: { headTeacherId: f.teacher.teacher.id } });
    await prisma.user.update({ where: { id: f.teacher.user.id }, data: { role: "DEPARTMENT_HEAD" } });
    const head = await asUser(f.teacher.user.id);
    expect(head.departmentId).toBe(f.department.id);

    await expect(createAnnouncement(head, { title: "x", audience: "DEPARTMENT", targetId: science.id, ...body })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(createAnnouncement(head, { title: "x", audience: "SCHOOL", ...body })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(createAnnouncement(head, { title: "x", audience: "TEACHERS", ...body })).rejects.toMatchObject({ code: "FORBIDDEN" });
    const res = await api(postAnnouncement, { cookie: await signIn(f.teacher.user.email), body: { title: "x", body: "y", audience: "DEPARTMENT", targetId: science.id } });
    expect(res.status).toBe(403);

    const own = await createAnnouncement(head, { title: "Own dept", audience: "DEPARTMENT", targetId: f.department.id, ...body });
    expect(own.targetId).toBe(f.department.id);
    const cls = await createAnnouncement(head, { title: "Class", audience: "CLASS", targetId: f.cls.id, ...body });
    expect(cls.audience).toBe("CLASS");
    // teachers (no announcements:manage) cannot create at all
    await expect(createAnnouncement(f.teacher2.auth, { title: "x", audience: "SCHOOL", ...body })).rejects.toMatchObject({ code: "FORBIDDEN" });
    // head cannot edit/delete an admin's announcement, nor read its stats
    const admins = await createAnnouncement(f.admin, { title: "Admin's", audience: "SCHOOL", ...body });
    await expect(updateAnnouncement(head, admins.id, { title: "Hijacked" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(deleteAnnouncement(head, admins.id)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(announcementReadStats(head, admins.id)).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect((await announcementReadStats(head, own.id)).recipientCount).toBe(1); // teacher2 (author excluded)
  });

  it("scheduled (future publishAt) announcements are hidden from non-managers until published", async () => {
    const f = await createSchoolFixture();
    const a = await createAnnouncement(f.admin, { title: "Later", audience: "SCHOOL", publishAt: new Date(Date.now() + DAY), ...body });
    expect(await listAnnouncementsForUser(f.teacher.auth)).toEqual([]);
    expect(await listAnnouncementsForUser(f.students[0].auth!)).toEqual([]);
    await expect(getAnnouncement(f.teacher.auth, a.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(await prisma.notification.count({ where: { type: "ANNOUNCEMENT" } })).toBe(0);
    // managers see scheduled ones by default, and can hide them
    expect((await listAnnouncementsForUser(f.admin)).map((x) => x.id)).toEqual([a.id]);
    expect(await listAnnouncementsForUser(f.admin, { includeInactive: "false" })).toEqual([]);
    expect(await recentAnnouncementsForUser(f.admin)).toEqual([]);

    // publishing it now notifies the recipients and makes it visible
    await updateAnnouncement(f.admin, a.id, { publishAt: new Date(Date.now() - 1000) });
    expect((await listAnnouncementsForUser(f.teacher.auth)).map((x) => x.id)).toEqual([a.id]);
    const userCount = await prisma.user.count({ where: { schoolId: f.school.id, isActive: true } });
    expect(await prisma.notification.count({ where: { type: "ANNOUNCEMENT" } })).toBe(userCount - 1);
  });

  it("expired announcements are hidden from non-managers", async () => {
    const f = await createSchoolFixture();
    const a = await createAnnouncement(f.admin, { title: "Old news", audience: "SCHOOL", publishAt: new Date(Date.now() - 2 * DAY), expiresAt: new Date(Date.now() - DAY), ...body });
    expect(await listAnnouncementsForUser(f.teacher.auth)).toEqual([]);
    expect(await listAnnouncementsForUser(f.guardian.auth)).toEqual([]);
    await expect(getAnnouncement(f.students[0].auth!, a.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect((await listAnnouncementsForUser(f.admin)).map((x) => x.id)).toEqual([a.id]);
    expect(await recentAnnouncementsForUser(f.teacher.auth)).toEqual([]);
    // still active one shows up
    const live = await createAnnouncement(f.admin, { title: "Live", audience: "SCHOOL", expiresAt: new Date(Date.now() + DAY), ...body });
    expect((await listAnnouncementsForUser(f.teacher.auth)).map((x) => x.id)).toEqual([live.id]);
    expect((await recentAnnouncementsForUser(f.teacher.auth)).map((x) => x.id)).toEqual([live.id]);
    // expiry must be after publish
    await expect(createAnnouncement(f.admin, { title: "x", audience: "SCHOOL", expiresAt: new Date(Date.now() - DAY), ...body })).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    await expect(updateAnnouncement(f.admin, live.id, { expiresAt: new Date(Date.now() - 3 * DAY) })).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("announcements are isolated per school and audited on delete", async () => {
    const f = await createSchoolFixture();
    const other = await createOtherSchool();
    const a = await createAnnouncement(f.admin, { title: "Ours", audience: "SCHOOL", ...body });
    expect(await listAnnouncementsForUser(other.admin)).toEqual([]);
    await expect(getAnnouncement(other.admin, a.id)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(deleteAnnouncement(other.admin, a.id)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await deleteAnnouncement(f.admin, a.id);
    expect(await prisma.announcement.count()).toBe(0);
    expect(await prisma.auditLog.count({ where: { action: "announcement.delete", entityId: a.id } })).toBe(1);
  });
});

describe("announcement read tracking under concurrency", () => {
  it("marking the same announcement read twice at once never conflicts", async () => {
    const { createSchoolFixture } = await import("../helpers");
    const { createAnnouncement, markAnnouncementRead } = await import("@/modules/announcements/service");
    const f = await createSchoolFixture();
    const a = await createAnnouncement(f.admin, { title: "Hello", body: "World", audience: "SCHOOL", priority: "NORMAL", attachments: [] } as never);
    const results = await Promise.all([markAnnouncementRead(f.teacher.auth, a.id), markAnnouncementRead(f.teacher.auth, a.id), markAnnouncementRead(f.teacher.auth, a.id)]);
    expect(results.every((r) => r.read)).toBe(true);
  });
});
