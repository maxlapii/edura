import { describe, expect, it } from "vitest";
import { createSchoolFixture, createOtherSchool, createUser, asUser, signIn, api, prisma } from "../helpers";
import { cancelMeeting, completeMeeting, createMeeting, getMeeting, listMeetings, respondToMeeting, updateMeeting, upcomingMeetingsForUser } from "@/modules/meetings/service";
import { POST as postMeeting, GET as getMeetings } from "@/app/api/meetings/route";
import { POST as respondRoute } from "@/app/api/meetings/[id]/respond/route";
import { POST as completeRoute } from "@/app/api/meetings/[id]/complete/route";

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

function slot(daysFromNow: number, hours = 1) {
  const startsAt = new Date(Date.now() + daysFromNow * DAY);
  return { startsAt, endsAt: new Date(startsAt.getTime() + hours * HOUR) };
}

describe("meetings", () => {
  it("creates a meeting with participants, notifies the invitees and audits", async () => {
    const f = await createSchoolFixture();
    const cookie = await signIn(f.adminUser.email);
    const res = await api(postMeeting, {
      cookie,
      body: { title: "Staff briefing", type: "STAFF", ...slot(2), roomId: f.room.id, agenda: "Agenda", participantUserIds: [f.teacher.user.id, f.teacher2.user.id, f.adminUser.id] },
    });
    expect(res.status).toBe(201);
    const meeting = res.data as { id: string; participants: Array<{ userId: string; status: string }>; room: { id: string }; organizerUserId: string };
    // the organizer is never a participant, even when listed
    expect(meeting.participants.map((p) => p.userId).sort()).toEqual([f.teacher.user.id, f.teacher2.user.id].sort());
    expect(meeting.participants.every((p) => p.status === "INVITED")).toBe(true);
    expect(meeting.room.id).toBe(f.room.id);
    expect(meeting.organizerUserId).toBe(f.adminUser.id);

    const invites = await prisma.notification.findMany({ where: { type: "MEETING_INVITE" } });
    expect(invites.map((n) => n.userId).sort()).toEqual([f.teacher.user.id, f.teacher2.user.id].sort());
    expect(invites[0].title).toBe("Meeting invitation: Staff briefing");
    expect(invites[0].link).toBe(`/meetings/${meeting.id}`);
    expect(await prisma.auditLog.count({ where: { action: "meeting.create", entityId: meeting.id } })).toBe(1);
  });

  it("rejects rooms and participants from another school", async () => {
    const f = await createSchoolFixture();
    const other = await createOtherSchool();
    const otherRoom = await prisma.room.create({ data: { schoolId: other.school.id, name: "Elsewhere", code: "X1" } });
    await expect(createMeeting(f.admin, { title: "Bad room", type: "STAFF", ...slot(1), roomId: otherRoom.id, participantUserIds: [] })).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    await expect(createMeeting(f.admin, { title: "Bad guest", type: "STAFF", ...slot(1), participantUserIds: [other.teacher.user.id] })).rejects.toMatchObject({
      code: "VALIDATION_ERROR",
      details: { invalid: [other.teacher.user.id] },
    });
    expect(await prisma.meeting.count()).toBe(0);
  });

  it("requires endsAt after startsAt (schema on create, service on update)", async () => {
    const f = await createSchoolFixture();
    const cookie = await signIn(f.adminUser.email);
    const { startsAt } = slot(1);
    const res = await api(postMeeting, { cookie, body: { title: "Backwards", startsAt, endsAt: new Date(startsAt.getTime() - HOUR), participantUserIds: [] } });
    expect(res.status).toBe(422);
    expect(res.error?.code).toBe("VALIDATION_ERROR");

    const meeting = await createMeeting(f.admin, { title: "Ok", type: "STAFF", ...slot(1), participantUserIds: [] });
    await expect(updateMeeting(f.admin, meeting.id, { endsAt: new Date(meeting.startsAt.getTime() - HOUR) })).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("teachers cannot create meetings but department heads can", async () => {
    const f = await createSchoolFixture();
    await expect(createMeeting(f.teacher.auth, { title: "Nope", type: "STAFF", ...slot(1), participantUserIds: [] })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect((await api(postMeeting, { cookie: await signIn(f.teacher.user.email), body: { title: "Nope", ...slot(1), participantUserIds: [] } })).status).toBe(403);

    await prisma.department.update({ where: { id: f.department.id }, data: { headTeacherId: f.teacher2.teacher.id } });
    await prisma.user.update({ where: { id: f.teacher2.user.id }, data: { role: "DEPARTMENT_HEAD" } });
    const head = await asUser(f.teacher2.user.id);
    const meeting = await createMeeting(head, { title: "Dept sync", type: "DEPARTMENT", ...slot(1), participantUserIds: [f.teacher.user.id] });
    expect(meeting.organizerUserId).toBe(head.id);
  });

  it("lists meetings scoped to organizer/participants; admins see everything", async () => {
    const f = await createSchoolFixture();
    const other = await createOtherSchool();
    const meeting = await createMeeting(f.admin, { title: "Only teacher one", type: "STAFF", ...slot(1), participantUserIds: [f.teacher.user.id] });
    await createMeeting(other.admin, { title: "Other school", type: "STAFF", ...slot(1), participantUserIds: [other.teacher.user.id] });

    expect((await listMeetings(f.teacher.auth)).map((m) => m.id)).toEqual([meeting.id]);
    expect(await listMeetings(f.teacher2.auth)).toEqual([]);
    expect((await listMeetings(f.admin)).map((m) => m.id)).toEqual([meeting.id]);
    expect((await listMeetings(f.principal)).map((m) => m.id)).toEqual([meeting.id]);

    await expect(getMeeting(f.teacher2.auth, meeting.id)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(getMeeting(other.admin, meeting.id)).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect((await getMeeting(f.teacher.auth, meeting.id)).id).toBe(meeting.id);

    const res = await api(getMeetings, { cookie: await signIn(f.teacher2.user.email) });
    expect(res.status).toBe(200);
    expect(res.data).toEqual([]);

    // filters
    expect(await listMeetings(f.admin, { status: "CANCELLED" })).toEqual([]);
    expect(await listMeetings(f.admin, { from: new Date(Date.now() + 5 * DAY) })).toEqual([]);
    expect((await listMeetings(f.admin, { type: "STAFF", from: new Date() })).length).toBe(1);
  });

  it("participants respond ACCEPTED/DECLINED; non-participants are forbidden", async () => {
    const f = await createSchoolFixture();
    const meeting = await createMeeting(f.admin, { title: "RSVP", type: "STAFF", ...slot(1), participantUserIds: [f.teacher.user.id, f.teacher2.user.id] });

    const res = await api(respondRoute, { cookie: await signIn(f.teacher.user.email), params: { id: meeting.id }, body: { status: "ACCEPTED" } });
    expect(res.status).toBe(200);
    expect(res.data).toMatchObject({ userId: f.teacher.user.id, status: "ACCEPTED" });

    const declined = await respondToMeeting(f.teacher2.auth, meeting.id, { status: "DECLINED" });
    expect(declined.status).toBe("DECLINED");
    expect(await prisma.auditLog.count({ where: { action: "meeting.respond" } })).toBe(2);

    const stranger = await createUser("STAFF", f.school.id);
    await expect(respondToMeeting(await asUser(stranger.id), meeting.id, { status: "ACCEPTED" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    // the organizer is not a participant either
    await expect(respondToMeeting(f.admin, meeting.id, { status: "ACCEPTED" })).rejects.toMatchObject({ code: "FORBIDDEN" });

    const invalid = await api(respondRoute, { cookie: await signIn(f.teacher.user.email), params: { id: meeting.id }, body: { status: "MAYBE" } });
    expect(invalid.status).toBe(422);

    await cancelMeeting(f.admin, meeting.id);
    await expect(respondToMeeting(f.teacher.auth, meeting.id, { status: "ACCEPTED" })).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("completes a meeting: minutes, action items become tasks, workflow notifies participants", async () => {
    const f = await createSchoolFixture();
    const meeting = await createMeeting(f.admin, { title: "Planning", type: "MANAGEMENT", ...slot(-1), participantUserIds: [f.teacher.user.id, f.teacher2.user.id] });
    await prisma.notification.deleteMany({});
    const due = new Date(Date.now() + 3 * DAY);

    const res = await api(completeRoute, {
      cookie: await signIn(f.adminUser.email),
      params: { id: meeting.id },
      body: {
        minutes: "We discussed things.",
        decisions: "Do the things.",
        actionItems: [
          { description: "Prepare the syllabus", assigneeUserId: f.teacher.user.id, dueDate: due },
          { description: "Unassigned follow-up" },
          { description: "Organizer's own item", assigneeUserId: f.adminUser.id },
        ],
        attendedUserIds: [f.teacher.user.id],
      },
    });
    expect(res.status).toBe(200);
    const done = res.data as { status: string; minutes: string; decisions: string; participants: Array<{ userId: string; status: string }>; actionItems: Array<{ description: string; taskId: string | null; assigneeUserId: string | null }> };
    expect(done.status).toBe("COMPLETED");
    expect(done.minutes).toBe("We discussed things.");
    expect(done.decisions).toBe("Do the things.");
    expect(done.participants.find((p) => p.userId === f.teacher.user.id)?.status).toBe("ATTENDED");
    expect(done.participants.find((p) => p.userId === f.teacher2.user.id)?.status).toBe("INVITED");
    expect(done.actionItems).toHaveLength(3);
    expect(done.actionItems.find((a) => a.description === "Unassigned follow-up")?.taskId).toBeNull();

    const tasks = await prisma.task.findMany({ where: { source: "MEETING", sourceId: meeting.id }, orderBy: { createdAt: "asc" } });
    expect(tasks).toHaveLength(2);
    const teacherTask = tasks.find((t) => t.assigneeUserId === f.teacher.user.id)!;
    expect(teacherTask).toMatchObject({ title: "Prepare the syllabus", status: "TODO", createdByUserId: f.adminUser.id, schoolId: f.school.id });
    expect(teacherTask.dueDate?.getTime()).toBe(due.getTime());
    expect(done.actionItems.find((a) => a.assigneeUserId === f.teacher.user.id)?.taskId).toBe(teacherTask.id);

    // assignee (not the organizer) is notified about the task
    const taskNotes = await prisma.notification.findMany({ where: { type: "TASK_ASSIGNED" } });
    expect(taskNotes.map((n) => n.userId)).toEqual([f.teacher.user.id]);
    expect(taskNotes[0].title).toBe("New task: Prepare the syllabus");

    // MEETING_COMPLETED dispatched; the default rule notifies every participant
    const runs = await prisma.workflowRun.findMany({ where: { schoolId: f.school.id, trigger: "MEETING_COMPLETED" } });
    expect(runs).toHaveLength(1);
    expect(runs[0].status).toBe("SUCCESS");
    expect(runs[0].payload).toMatchObject({ meetingId: meeting.id, meetingTitle: "Planning", actionItems: 3, organizerUserId: f.adminUser.id });
    const minutesNotes = await prisma.notification.findMany({ where: { type: "MEETING_REMINDER", title: "Minutes available: Planning" } });
    expect(minutesNotes.map((n) => n.userId).sort()).toEqual([f.teacher.user.id, f.teacher2.user.id].sort());
    expect(minutesNotes[0].link).toBe(`/meetings/${meeting.id}`);

    // completing twice is a conflict, and it cannot be cancelled anymore
    await expect(completeMeeting(f.admin, meeting.id, { actionItems: [] })).rejects.toMatchObject({ code: "CONFLICT" });
    await expect(cancelMeeting(f.admin, meeting.id)).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("only the organizer or an administrator may complete/cancel; assignees must belong to the school", async () => {
    const f = await createSchoolFixture();
    const other = await createOtherSchool();
    await prisma.department.update({ where: { id: f.department.id }, data: { headTeacherId: f.teacher2.teacher.id } });
    await prisma.user.update({ where: { id: f.teacher2.user.id }, data: { role: "DEPARTMENT_HEAD" } });
    const head = await asUser(f.teacher2.user.id);
    const meeting = await createMeeting(f.admin, { title: "Admin's", type: "STAFF", ...slot(1), participantUserIds: [head.id] });

    await expect(completeMeeting(head, meeting.id, { actionItems: [] })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(cancelMeeting(head, meeting.id)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(completeMeeting(f.admin, meeting.id, { actionItems: [{ description: "x", assigneeUserId: other.teacher.user.id }] })).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    expect((await prisma.meeting.findUniqueOrThrow({ where: { id: meeting.id } })).status).toBe("SCHEDULED");

    const own = await createMeeting(head, { title: "Head's", type: "DEPARTMENT", ...slot(1), participantUserIds: [f.teacher.user.id] });
    expect((await completeMeeting(head, own.id, { minutes: "done", actionItems: [] })).status).toBe("COMPLETED");
  });

  it("cancelling notifies the participants and audits", async () => {
    const f = await createSchoolFixture();
    const meeting = await createMeeting(f.admin, { title: "Doomed", type: "STAFF", ...slot(1), participantUserIds: [f.teacher.user.id, f.teacher2.user.id] });
    await prisma.notification.deleteMany({});
    const cancelled = await cancelMeeting(f.principal, meeting.id);
    expect(cancelled.status).toBe("CANCELLED");
    const notes = await prisma.notification.findMany({ where: { title: "Meeting cancelled: Doomed" } });
    expect(notes.map((n) => n.userId).sort()).toEqual([f.teacher.user.id, f.teacher2.user.id].sort());
    expect(await prisma.auditLog.count({ where: { action: "meeting.cancel", entityId: meeting.id } })).toBe(1);
    await expect(cancelMeeting(f.admin, meeting.id)).rejects.toMatchObject({ code: "CONFLICT" });
    await expect(updateMeeting(f.admin, meeting.id, { title: "Revived" })).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("updating participants invites the newcomers and rescheduling notifies the others", async () => {
    const f = await createSchoolFixture();
    const meeting = await createMeeting(f.admin, { title: "Moving", type: "STAFF", ...slot(1), participantUserIds: [f.teacher.user.id] });
    await prisma.notification.deleteMany({});
    const newStart = new Date(meeting.startsAt.getTime() + DAY);
    const updated = await updateMeeting(f.admin, meeting.id, { participantUserIds: [f.teacher.user.id, f.teacher2.user.id], startsAt: newStart, endsAt: new Date(newStart.getTime() + HOUR) });
    expect(updated.participants.map((p) => p.userId).sort()).toEqual([f.teacher.user.id, f.teacher2.user.id].sort());
    const invites = await prisma.notification.findMany({ where: { title: "Meeting invitation: Moving" } });
    expect(invites.map((n) => n.userId)).toEqual([f.teacher2.user.id]);
    const moved = await prisma.notification.findMany({ where: { title: "Meeting rescheduled: Moving" } });
    expect(moved.map((n) => n.userId)).toEqual([f.teacher.user.id]);

    const removed = await updateMeeting(f.admin, meeting.id, { participantUserIds: [f.teacher2.user.id] });
    expect(removed.participants.map((p) => p.userId)).toEqual([f.teacher2.user.id]);
  });

  it("upcomingMeetingsForUser only returns scheduled, non-declined meetings inside the window", async () => {
    const f = await createSchoolFixture();
    const now = new Date();
    const soon = await createMeeting(f.admin, { title: "Soon", type: "STAFF", ...slot(2), participantUserIds: [f.teacher.user.id] });
    await createMeeting(f.admin, { title: "Far", type: "STAFF", ...slot(10), participantUserIds: [f.teacher.user.id] });
    await createMeeting(f.admin, { title: "Past", type: "STAFF", ...slot(-1), participantUserIds: [f.teacher.user.id] });
    const declined = await createMeeting(f.admin, { title: "Declined", type: "STAFF", ...slot(3), participantUserIds: [f.teacher.user.id] });
    await respondToMeeting(f.teacher.auth, declined.id, { status: "DECLINED" });
    const cancelled = await createMeeting(f.admin, { title: "Cancelled", type: "STAFF", ...slot(4), participantUserIds: [f.teacher.user.id] });
    await cancelMeeting(f.admin, cancelled.id);
    await createMeeting(f.admin, { title: "Not invited", type: "STAFF", ...slot(2), participantUserIds: [f.teacher2.user.id] });

    const teacherUpcoming = await upcomingMeetingsForUser(f.teacher.user.id, 7, now);
    expect(teacherUpcoming.map((m) => m.title)).toEqual(["Soon"]);
    expect(teacherUpcoming[0]).toMatchObject({ id: soon.id, _count: { participants: 1 } });

    // organizer sees their own meetings (except cancelled) within the window, including the declined one
    const adminUpcoming = await upcomingMeetingsForUser(f.adminUser.id, 7, now);
    expect(adminUpcoming.map((m) => m.title).sort()).toEqual(["Declined", "Not invited", "Soon"]);
    expect((await upcomingMeetingsForUser(f.adminUser.id, 14, now)).map((m) => m.title)).toContain("Far");
  });
});
