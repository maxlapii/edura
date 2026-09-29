import "dotenv/config";
import { prisma } from "@/lib/db";
import { hashPassword } from "@/lib/auth/password";
import { installSchoolDefaults } from "@/modules/schools/service";
import { findConflicts, type SlotLike } from "@/modules/timetable/conflicts";
import { toDateOnly, dayOfWeek } from "@/lib/utils/dates";
import { addDays, subDays } from "date-fns";
import type { AttendanceStatus, Role } from "@/generated/prisma/enums";
import { ADMINS, CLASSES, CLASS_SUBJECTS, DEMO_PASSWORD, DEPARTMENTS, FIRST_NAMES, LAST_NAMES, MESSAGE_TEMPLATES, ROOMS, SCHOOL, STAFF, SUBJECTS, SUPER_ADMIN, TEACHERS } from "./seed/data";

/** Deterministic pseudo-random generator so the seed is reproducible. */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0xffffffff;
  };
}
const rand = rng(42);
const pick = <T,>(arr: readonly T[]) => arr[Math.floor(rand() * arr.length)];
const d = (s: string) => new Date(`${s}T00:00:00.000Z`);
const at = (date: Date, h: number, m = 0) => new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), h, m));

async function main() {
  const start = Date.now();
  const today = toDateOnly(new Date());
  console.log(`Seeding Edura demo data (today = ${today.toISOString().slice(0, 10)})…`);

  // ── Reset previous demo data ────────────────────────────────────────────
  const existing = await prisma.school.findUnique({ where: { code: SCHOOL.code } });
  if (existing) {
    // Deleting the school cascades every school-owned record; users are detached (SetNull) and removed afterwards.
    const userIds = (await prisma.user.findMany({ where: { schoolId: existing.id }, select: { id: true } })).map((u) => u.id);
    await prisma.school.delete({ where: { id: existing.id } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  }
  await prisma.user.deleteMany({ where: { email: SUPER_ADMIN.email } });

  const passwordHash = await hashPassword(DEMO_PASSWORD);
  const createUser = async (name: string, email: string, role: Role, schoolId: string | null, phone?: string) => {
    const user = await prisma.user.create({ data: { name, email, role, schoolId, phone: phone ?? null, emailVerified: true } });
    // better-auth expects the credential account's accountId to equal the user id.
    await prisma.account.create({ data: { userId: user.id, providerId: "credential", accountId: user.id, password: passwordHash } });
    return user;
  };

  // ── School, defaults, academic year ────────────────────────────────────
  const school = await prisma.school.create({ data: { ...SCHOOL, settings: { absenceThreshold: 3, absenceWindowDays: 30 } } });
  await installSchoolDefaults(school.id);
  const periods = await prisma.period.findMany({ where: { schoolId: school.id }, orderBy: { order: "asc" } });

  const year = await prisma.academicYear.create({ data: { schoolId: school.id, name: "2026/2027", startDate: d("2026-09-01"), endDate: d("2027-06-30"), isCurrent: true } });
  const [term1] = await Promise.all([
    prisma.term.create({ data: { schoolId: school.id, academicYearId: year.id, name: "Term 1", startDate: d("2026-09-01"), endDate: d("2026-12-18"), isCurrent: true } }),
    prisma.term.create({ data: { schoolId: school.id, academicYearId: year.id, name: "Term 2", startDate: d("2027-01-05"), endDate: d("2027-03-26") } }),
    prisma.term.create({ data: { schoolId: school.id, academicYearId: year.id, name: "Term 3", startDate: d("2027-04-06"), endDate: d("2027-06-30") } }),
  ]);

  // ── Users: super admin, admins, principal ──────────────────────────────
  await createUser(SUPER_ADMIN.name, SUPER_ADMIN.email, "SUPER_ADMIN", null);
  const adminUsers = [];
  for (const a of ADMINS) adminUsers.push(await createUser(a.name, a.email, a.role, school.id));
  const principal = adminUsers[0];
  const admin = adminUsers[1];

  // ── Departments, subjects ──────────────────────────────────────────────
  const deptByCode = new Map<string, { id: string }>();
  for (const dep of DEPARTMENTS) deptByCode.set(dep.code, await prisma.department.create({ data: { schoolId: school.id, ...dep } }));
  const subjectByCode = new Map<string, { id: string }>();
  for (const s of SUBJECTS) subjectByCode.set(s.code, await prisma.subject.create({ data: { schoolId: school.id, name: s.name, code: s.code, departmentId: deptByCode.get(s.dept)!.id } }));

  // ── Rooms ──────────────────────────────────────────────────────────────
  const rooms = [];
  for (const r of ROOMS) rooms.push(await prisma.room.create({ data: { schoolId: school.id, ...r } }));
  const classrooms = rooms.filter((r) => r.type === "CLASSROOM");
  const meetingRoom = rooms.find((r) => r.code === "MR1")!;

  // ── Teachers ───────────────────────────────────────────────────────────
  const teachers: Array<{ id: string; userId: string; departmentId: string | null; user: { id: string; name: string } }> = [];
  for (const [i, t] of TEACHERS.entries()) {
    const user = await createUser(t.name, t.email, i === 0 ? "DEPARTMENT_HEAD" : "TEACHER", school.id, `+1 555 01${String(10 + i).padStart(2, "0")}`);
    const teacher = await prisma.teacher.create({
      data: {
        schoolId: school.id,
        userId: user.id,
        employeeNumber: t.employeeNumber,
        employmentType: i === 9 ? "PART_TIME" : "FULL_TIME",
        hireDate: d(t.hireDate),
        departmentId: deptByCode.get(t.dept)!.id,
        position: t.position,
        qualifications: ["BEd", i % 3 === 0 ? "MEd" : "PGCE"],
        emergencyContactName: "Family contact",
        emergencyContactPhone: "+1 555 0999",
        maxWeeklyPeriods: i === 9 ? 15 : 25,
        subjects: { create: t.subjects.map((code) => ({ subjectId: subjectByCode.get(code)!.id })) },
        availability: { create: [{ dayOfWeek: 5, periodId: periods[7].id, type: "UNAVAILABLE", note: "Friday last period unavailable" }, { dayOfWeek: 1 + (i % 5), periodId: null, type: "PREFERRED_SUBSTITUTION" }] },
      },
      include: { user: true },
    });
    teachers.push(teacher);
  }
  await prisma.department.update({ where: { id: deptByCode.get("MATH")!.id }, data: { headTeacherId: teachers[0].id } });
  const teacherForSubject = (code: string) => {
    const candidates = teachers.filter((_, i) => TEACHERS[i].subjects.includes(code));
    return candidates[Math.floor(rand() * candidates.length)];
  };

  // ── Staff ──────────────────────────────────────────────────────────────
  const staffUsers = [];
  for (const s of STAFF) {
    const user = await createUser(s.name, s.email, "STAFF", school.id);
    staffUsers.push(user);
    await prisma.staff.create({ data: { schoolId: school.id, userId: user.id, employeeNumber: s.employeeNumber, staffType: s.staffType, position: s.position } });
  }
  const maintenanceUser = staffUsers[3];

  // ── Classes + students ─────────────────────────────────────────────────
  const classes = [];
  const students: Array<{ id: string; userId: string | null; classId: string; firstName: string; lastName: string }> = [];
  let studentNo = 1;
  for (const [ci, c] of CLASSES.entries()) {
    const cls = await prisma.schoolClass.create({ data: { schoolId: school.id, academicYearId: year.id, name: c.name, gradeLevel: c.gradeLevel, homeroomTeacherId: teachers[ci % teachers.length].id, roomId: classrooms[ci].id, capacity: 30 } });
    classes.push(cls);
    for (let i = 0; i < 10; i++) {
      const firstName = FIRST_NAMES[(studentNo * 7) % FIRST_NAMES.length];
      const lastName = LAST_NAMES[(studentNo * 11) % LAST_NAMES.length];
      const email = `student${studentNo}@edura.dev`;
      const user = await createUser(`${firstName} ${lastName}`, email, "STUDENT", school.id);
      const st = await prisma.student.create({
        data: { schoolId: school.id, userId: user.id, studentNumber: `S-${String(studentNo).padStart(4, "0")}`, firstName, lastName, dateOfBirth: d(`${2026 - c.gradeLevel - 6}-0${1 + (i % 9)}-1${i % 9}`), gender: i % 2 ? "F" : "M", classId: cls.id, enrollmentDate: d("2026-09-01"), medicalNotes: i === 3 ? "Mild peanut allergy – EpiPen in office." : null },
      });
      students.push({ id: st.id, userId: user.id, classId: cls.id, firstName, lastName });
      studentNo++;
    }
  }

  // ── Guardians (20, each linked to 2 students) ──────────────────────────
  for (let g = 0; g < 20; g++) {
    const kids = [students[g * 2], students[g * 2 + 1]];
    const user = await createUser(`${pick(FIRST_NAMES)} ${kids[0].lastName}`, `parent${g + 1}@edura.dev`, "PARENT", school.id, `+1 555 02${String(g).padStart(2, "0")}`);
    await prisma.guardian.create({ data: { schoolId: school.id, userId: user.id, phone: user.phone, students: { create: kids.map((k, i) => ({ studentId: k.id, relationship: i === 0 ? "MOTHER" : "FATHER", isPrimary: i === 0 })) } } });
  }

  // ── Courses + timetable ────────────────────────────────────────────────
  const courses: Array<{ id: string; classId: string; subjectId: string; teacherId: string; roomId: string | null; subjectCode: string }> = [];
  for (const [ci, cls] of classes.entries()) {
    for (const code of CLASS_SUBJECTS[CLASSES[ci].gradeLevel]) {
      const teacher = teacherForSubject(code);
      const course = await prisma.course.create({ data: { schoolId: school.id, academicYearId: year.id, classId: cls.id, subjectId: subjectByCode.get(code)!.id, teacherId: teacher.id } });
      courses.push({ ...course, roomId: classrooms[ci].id, subjectCode: code });
    }
  }
  const placed: SlotLike[] = [];
  const slotRows = [];
  for (const course of courses) {
    let placedForCourse = 0;
    let attempts = 0;
    while (placedForCourse < 3 && attempts < 200) {
      attempts++;
      const dow = 1 + Math.floor(rand() * 5);
      const period = periods[Math.floor(rand() * periods.length)];
      const candidate: SlotLike = { id: `${course.id}-${placedForCourse}`, teacherId: course.teacherId, classId: course.classId, roomId: course.roomId, dayOfWeek: dow, periodId: period.id };
      if (findConflicts(placed, candidate).length) continue;
      placed.push(candidate);
      slotRows.push({ schoolId: school.id, courseId: course.id, teacherId: course.teacherId, classId: course.classId, periodId: period.id, roomId: course.roomId, dayOfWeek: dow });
      placedForCourse++;
    }
  }
  await prisma.timetableSlot.createMany({ data: slotRows });
  const slots = await prisma.timetableSlot.findMany({ where: { schoolId: school.id }, include: { period: true } });

  // ── Attendance history (school days from Sep 1 until yesterday) ────────
  const frequentAbsentees = new Set(students.filter((_, i) => i % 17 === 0).map((s) => s.id));
  const sessionRows: Array<{ id?: string; courseId: string; timetableSlotId: string; periodId: string; date: Date }> = [];
  for (let date = d("2026-09-01"); date < today; date = addDays(date, 1)) {
    const dow = dayOfWeek(date);
    if (dow > 5) continue;
    for (const slot of slots.filter((s) => s.dayOfWeek === dow)) sessionRows.push({ courseId: slot.courseId, timetableSlotId: slot.id, periodId: slot.periodId, date });
  }
  await prisma.attendanceSession.createMany({ data: sessionRows.map((s) => ({ schoolId: school.id, courseId: s.courseId, timetableSlotId: s.timetableSlotId, periodId: s.periodId, date: s.date, status: "SUBMITTED", submittedAt: at(s.date, 16), recordedById: courses.find((c) => c.id === s.courseId)!.teacherId })) });
  const sessions = await prisma.attendanceSession.findMany({ where: { schoolId: school.id }, select: { id: true, courseId: true, date: true } });
  const studentsByClass = new Map<string, typeof students>();
  for (const s of students) studentsByClass.set(s.classId, [...(studentsByClass.get(s.classId) ?? []), s]);
  const recordRows = [];
  for (const session of sessions) {
    const course = courses.find((c) => c.id === session.courseId)!;
    for (const st of studentsByClass.get(course.classId) ?? []) {
      const r = rand();
      const absentBias = frequentAbsentees.has(st.id) ? 0.25 : 0.03;
      const status: AttendanceStatus = r < absentBias ? "ABSENT" : r < absentBias + 0.03 ? "LATE" : r < absentBias + 0.04 ? "EXCUSED" : "PRESENT";
      recordRows.push({ schoolId: school.id, sessionId: session.id, studentId: st.id, date: session.date, status, minutesLate: status === "LATE" ? 5 + Math.floor(rand() * 15) : null });
    }
  }
  await prisma.attendanceRecord.createMany({ data: recordRows });

  // ── Assignments, submissions, assessments, grades ──────────────────────
  for (const course of courses) {
    const roster = studentsByClass.get(course.classId) ?? [];
    const past = await prisma.assignment.create({ data: { schoolId: school.id, courseId: course.id, title: `${course.subjectCode} Homework 1`, description: "Complete the exercises from chapter 1.", dueDate: at(subDays(today, 7), 23, 59), maxScore: 20 } });
    await prisma.assignment.create({ data: { schoolId: school.id, courseId: course.id, title: `${course.subjectCode} Project`, description: "Group project – see rubric.", dueDate: at(addDays(today, 10), 23, 59), maxScore: 100, rubric: [{ criterion: "Research", points: 40 }, { criterion: "Presentation", points: 30 }, { criterion: "Teamwork", points: 30 }] } });
    const quiz = await prisma.assessment.create({ data: { schoolId: school.id, courseId: course.id, termId: term1.id, title: `${course.subjectCode} Quiz 1`, type: "QUIZ", date: subDays(today, 10), maxScore: 50, weight: 1 } });
    const teacherUser = teachers.find((t) => t.id === course.teacherId)!.user;
    for (const st of roster) {
      const submits = rand() < 0.85;
      if (submits) {
        const late = rand() < 0.15;
        const graded = rand() < 0.7;
        await prisma.submission.create({ data: { schoolId: school.id, assignmentId: past.id, studentId: st.id, submittedAt: at(subDays(today, late ? 5 : 8), 18), content: "Submitted work.", isLate: late, status: graded ? "GRADED" : "SUBMITTED" } });
        if (graded) {
          const score = Math.round(8 + rand() * 12);
          await prisma.grade.create({ data: { schoolId: school.id, studentId: st.id, courseId: course.id, termId: term1.id, assignmentId: past.id, score, maxScore: 20, letter: score >= 18 ? "A" : score >= 16 ? "B" : score >= 14 ? "C" : score >= 12 ? "D" : "F", gradedById: teacherUser.id, status: "SUBMITTED", submittedAt: subDays(today, 4) } });
        }
      }
      const qs = Math.round(20 + rand() * 30);
      await prisma.grade.create({ data: { schoolId: school.id, studentId: st.id, courseId: course.id, termId: term1.id, assessmentId: quiz.id, score: qs, maxScore: 50, letter: qs >= 45 ? "A" : qs >= 40 ? "B" : qs >= 35 ? "C" : qs >= 30 ? "D" : "F", gradedById: teacherUser.id, status: rand() < 0.8 ? "SUBMITTED" : "DRAFT" } });
    }
  }

  // ── Lesson plans ───────────────────────────────────────────────────────
  for (const course of courses.slice(0, 30)) {
    await prisma.lessonPlan.create({ data: { schoolId: school.id, courseId: course.id, teacherId: course.teacherId, title: `${course.subjectCode} – Unit 1 introduction`, date: subDays(today, 3), curriculumTopic: "Unit 1", objectives: "Students can explain the key concepts of unit 1.", activities: "Warm-up quiz, guided practice, group discussion.", materials: "Textbook ch. 1, worksheet A", homework: "Exercises 1–10", status: "COMPLETED", completedAt: subDays(today, 3) } });
    await prisma.lessonPlan.create({ data: { schoolId: school.id, courseId: course.id, teacherId: course.teacherId, title: `${course.subjectCode} – Unit 1 practice`, date: addDays(today, 1), curriculumTopic: "Unit 1", objectives: "Apply unit 1 concepts to new problems.", activities: "Pair work, mini whiteboard checks.", status: "READY" } });
  }

  // ── Leave requests & substitutions ─────────────────────────────────────
  const leaveTeacher = teachers[2];
  const nextMonday = addDays(today, ((8 - dayOfWeek(today)) % 7) || 7);
  const approvedLeave = await prisma.leaveRequest.create({ data: { schoolId: school.id, requesterUserId: leaveTeacher.userId, teacherId: leaveTeacher.id, type: "TRAINING", startDate: nextMonday, endDate: addDays(nextMonday, 1), reason: "External training course", status: "APPROVED", reviewedById: admin.id, reviewedAt: subDays(today, 1), reviewComment: "Approved – enjoy the course." } });
  await prisma.approval.create({ data: { schoolId: school.id, type: "LEAVE", entityType: "LeaveRequest", entityId: approvedLeave.id, title: `${leaveTeacher.user.name}: TRAINING leave`, requesterUserId: leaveTeacher.userId, approverUserId: admin.id, status: "APPROVED", decisionAt: subDays(today, 1) } });
  const affected = slots.filter((s) => s.teacherId === leaveTeacher.id && (s.dayOfWeek === dayOfWeek(nextMonday) || s.dayOfWeek === dayOfWeek(addDays(nextMonday, 1))));
  for (const [i, slot] of affected.entries()) {
    const date = slot.dayOfWeek === dayOfWeek(nextMonday) ? nextMonday : addDays(nextMonday, 1);
    const sub = teachers.find((t) => t.id !== leaveTeacher.id && !slots.some((s) => s.teacherId === t.id && s.dayOfWeek === slot.dayOfWeek && s.periodId === slot.periodId));
    await prisma.substitution.create({ data: { schoolId: school.id, leaveRequestId: approvedLeave.id, timetableSlotId: slot.id, date, absentTeacherId: leaveTeacher.id, substituteTeacherId: i % 2 === 0 && sub ? sub.id : null, status: i % 2 === 0 && sub ? "ASSIGNED" : "PENDING" } });
  }
  const pendingLeave = await prisma.leaveRequest.create({ data: { schoolId: school.id, requesterUserId: teachers[5].userId, teacherId: teachers[5].id, type: "PERSONAL", startDate: addDays(today, 9), endDate: addDays(today, 9), reason: "Family appointment", status: "PENDING" } });
  await prisma.approval.create({ data: { schoolId: school.id, type: "LEAVE", entityType: "LeaveRequest", entityId: pendingLeave.id, title: `${teachers[5].user.name}: PERSONAL leave`, requesterUserId: teachers[5].userId } });
  await prisma.leaveRequest.create({ data: { schoolId: school.id, requesterUserId: teachers[7].userId, teacherId: teachers[7].id, type: "ANNUAL", startDate: subDays(today, 20), endDate: subDays(today, 18), reason: "Holiday", status: "REJECTED", reviewedById: principal.id, reviewedAt: subDays(today, 25), reviewComment: "Term-time holidays cannot be approved." } });

  // ── Meetings ───────────────────────────────────────────────────────────
  const staffMeeting = await prisma.meeting.create({ data: { schoolId: school.id, title: "Weekly staff meeting", type: "STAFF", startsAt: at(addDays(today, 2), 15, 30), endsAt: at(addDays(today, 2), 16, 30), roomId: meetingRoom.id, organizerUserId: principal.id, agenda: "1. Term 1 progress\n2. Parent evening planning\n3. AOB", participants: { create: [...teachers.map((t) => ({ userId: t.userId })), { userId: admin.id }] } } });
  await prisma.meeting.create({ data: { schoolId: school.id, title: "Mathematics department meeting", type: "DEPARTMENT", startsAt: at(addDays(today, 4), 14, 0), endsAt: at(addDays(today, 4), 15, 0), roomId: meetingRoom.id, organizerUserId: teachers[0].userId, agenda: "Scheme of work review", participants: { create: [{ userId: teachers[1].userId }] } } });
  const doneMeeting = await prisma.meeting.create({ data: { schoolId: school.id, title: "Term planning meeting", type: "MANAGEMENT", startsAt: at(subDays(today, 5), 9, 0), endsAt: at(subDays(today, 5), 10, 0), organizerUserId: principal.id, status: "COMPLETED", agenda: "Timetable sign-off, maintenance priorities", minutes: "Timetable approved. Projector replacements to be prioritised.", decisions: "Replace projectors in Rooms 103 and 106.", participants: { create: [{ userId: admin.id, status: "ATTENDED" }, { userId: teachers[0].userId, status: "ATTENDED" }] } } });
  const actionTask = await prisma.task.create({ data: { schoolId: school.id, title: "Order replacement projectors", assigneeUserId: admin.id, createdByUserId: principal.id, dueDate: addDays(today, 3), priority: "HIGH", source: "MEETING", sourceId: doneMeeting.id } });
  await prisma.meetingActionItem.create({ data: { meetingId: doneMeeting.id, description: "Order replacement projectors", assigneeUserId: admin.id, dueDate: addDays(today, 3), taskId: actionTask.id } });

  // ── Events ─────────────────────────────────────────────────────────────
  await prisma.event.createMany({
    data: [
      { schoolId: school.id, title: "Sports Day", type: "SPORTS", startsAt: at(addDays(today, 12), 9), endsAt: at(addDays(today, 12), 15), location: "Sports field", organizerUserId: teachers[9].userId, status: "SCHEDULED", audience: "SCHOOL" },
      { schoolId: school.id, title: "Parent–Teacher Evening", type: "PARENT_EVENT", startsAt: at(addDays(today, 16), 17), endsAt: at(addDays(today, 16), 20), location: "Main hall", organizerUserId: principal.id, status: "SCHEDULED", audience: "PARENTS" },
      { schoolId: school.id, title: "Autumn break", type: "HOLIDAY", startsAt: at(d("2026-10-26"), 0), endsAt: at(d("2026-10-30"), 23, 59), status: "SCHEDULED", audience: "SCHOOL" },
      { schoolId: school.id, title: "Science museum trip (Grade 8)", type: "TRIP", startsAt: at(addDays(today, 20), 8), endsAt: at(addDays(today, 20), 16), location: "City Science Museum", organizerUserId: teachers[2].userId, status: "PENDING_APPROVAL", requiresApproval: true, audience: "STUDENTS" },
    ],
  });
  const trip = await prisma.event.findFirst({ where: { schoolId: school.id, type: "TRIP" } });
  await prisma.approval.create({ data: { schoolId: school.id, type: "TRIP", entityType: "Event", entityId: trip!.id, title: "Science museum trip (Grade 8)", requesterUserId: teachers[2].userId } });

  // ── Announcements ──────────────────────────────────────────────────────
  await prisma.announcement.createMany({
    data: [
      { schoolId: school.id, title: "Welcome back!", body: "We hope everyone had a restful summer. Term 1 timetables are now live in Edura.", authorUserId: principal.id, audience: "SCHOOL", priority: "NORMAL", publishAt: subDays(today, 20) },
      { schoolId: school.id, title: "Grade submission deadline", body: "Term 1 interim grades must be submitted by the end of next week.", authorUserId: admin.id, audience: "TEACHERS", priority: "HIGH", publishAt: subDays(today, 1), expiresAt: addDays(today, 10) },
      { schoolId: school.id, title: "Sports Day volunteers", body: "Parents who can help on Sports Day please contact the office.", authorUserId: admin.id, audience: "PARENTS", priority: "NORMAL", publishAt: today },
    ],
  });

  // ── Maintenance ────────────────────────────────────────────────────────
  await prisma.maintenanceRequest.createMany({
    data: [
      { schoolId: school.id, title: "Projector not turning on", category: "PROJECTOR", description: "Room 103 projector shows no signal.", roomId: classrooms[2].id, reportedByUserId: teachers[1].userId, assignedToUserId: maintenanceUser.id, priority: "HIGH", status: "IN_PROGRESS", dueDate: addDays(today, 1) },
      { schoolId: school.id, title: "Air conditioning too cold", category: "AIR_CONDITIONING", description: "Lab 1 AC stuck at 16°C.", roomId: rooms.find((r) => r.code === "LAB1")!.id, reportedByUserId: teachers[3].userId, priority: "NORMAL", status: "OPEN", dueDate: subDays(today, 2) },
      { schoolId: school.id, title: "Broken chair", category: "FURNITURE", description: "Chair leg snapped in Room 108.", roomId: classrooms[7].id, reportedByUserId: teachers[6].userId, assignedToUserId: maintenanceUser.id, priority: "LOW", status: "ASSIGNED", dueDate: addDays(today, 7) },
      { schoolId: school.id, title: "Computer lab PC 12 will not boot", category: "COMPUTER", roomId: rooms.find((r) => r.code === "CLAB")!.id, reportedByUserId: teachers[2].userId, assignedToUserId: staffUsers[2].id, priority: "NORMAL", status: "RESOLVED", resolvedAt: subDays(today, 1), resolutionNote: "Replaced power supply." },
      { schoolId: school.id, title: "Gym floor needs cleaning", category: "CLEANING", roomId: rooms.find((r) => r.code === "GYM")!.id, reportedByUserId: teachers[9].userId, priority: "URGENT", status: "OPEN" },
    ],
  });

  // ── Tasks ──────────────────────────────────────────────────────────────
  const taskRows = [];
  for (const [i, t] of teachers.entries()) {
    taskRows.push({ schoolId: school.id, title: `Submit Term 1 interim grades`, assigneeUserId: t.userId, createdByUserId: admin.id, dueDate: addDays(today, 5), priority: "HIGH" as const, source: "ADMIN" as const });
    taskRows.push({ schoolId: school.id, title: i % 2 ? "Prepare Unit 2 lesson plans" : "Review student support cases", assigneeUserId: t.userId, createdByUserId: t.userId, dueDate: addDays(today, 2 + i), priority: "MEDIUM" as const, source: "SELF" as const });
    if (i % 3 === 0) taskRows.push({ schoolId: school.id, title: "Complete safeguarding training", assigneeUserId: t.userId, createdByUserId: admin.id, dueDate: subDays(today, 2), priority: "HIGH" as const, source: "ADMIN" as const });
  }
  taskRows.push({ schoolId: school.id, title: "Publish Sports Day schedule", assigneeUserId: admin.id, createdByUserId: principal.id, dueDate: addDays(today, 4), priority: "MEDIUM" as const, source: "ADMIN" as const });
  await prisma.task.createMany({ data: taskRows });

  // ── Support cases, discipline, bookings, certifications, templates ─────
  const caseStudent = students[17];
  await prisma.supportCase.create({ data: { schoolId: school.id, studentId: caseStudent.id, category: "ATTENDANCE", title: "Repeated absences", description: "Student has missed several lessons; parents contacted.", assignedToUserId: teachers[1].userId, createdByUserId: admin.id, status: "IN_PROGRESS", followUpDate: addDays(today, 7), notes: { create: [{ authorUserId: admin.id, body: "Called home – parent will monitor attendance." }] } } });
  await prisma.supportCase.create({ data: { schoolId: school.id, studentId: students[34].id, category: "WELLBEING", title: "Wellbeing check-in", description: "Confidential – see counsellor notes.", isSensitive: true, assignedToUserId: principal.id, createdByUserId: principal.id, status: "OPEN" } });
  await prisma.disciplineIncident.createMany({
    data: [
      { schoolId: school.id, studentId: students[51].id, category: "Disruption", date: subDays(today, 6), severity: "MINOR", description: "Repeatedly talking during instruction after warnings.", reportedByUserId: teachers[4].userId, actions: "Verbal warning; seat moved.", parentNotified: false },
      { schoolId: school.id, studentId: students[73].id, category: "Property damage", date: subDays(today, 2), severity: "MODERATE", description: "Damaged a lab stool.", reportedByUserId: teachers[3].userId, actions: "Parents informed; cost of repair discussed.", parentNotified: true, followUp: "Meet with parents on Friday." },
    ],
  });
  await prisma.roomBooking.createMany({
    data: [
      { schoolId: school.id, roomId: meetingRoom.id, bookedByUserId: admin.id, date: addDays(today, 1), startTime: "10:00", endTime: "11:00", purpose: "Parent meeting" },
      { schoolId: school.id, roomId: rooms.find((r) => r.code === "LIB")!.id, bookedByUserId: teachers[4].userId, date: addDays(today, 3), startTime: "13:10", endTime: "13:55", purpose: "Research lesson" },
    ],
  });
  await prisma.certification.createMany({
    data: [
      { schoolId: school.id, teacherId: teachers[0].id, name: "First Aid at Work", issuer: "Red Cross", issuedAt: subDays(today, 1075), expiresAt: addDays(today, 20) },
      { schoolId: school.id, teacherId: teachers[3].id, name: "Laboratory Safety", issuer: "CLEAPSS", issuedAt: subDays(today, 700), expiresAt: addDays(today, 200) },
      { schoolId: school.id, teacherId: teachers[9].id, name: "Lifeguard", issuer: "RLSS", issuedAt: subDays(today, 720), expiresAt: addDays(today, 12) },
    ],
  });
  await prisma.professionalDevelopment.createMany({
    data: [
      { schoolId: school.id, teacherId: teachers[0].id, type: "WORKSHOP", title: "Mastery in mathematics", date: subDays(today, 40), hours: 6, status: "COMPLETED" },
      { schoolId: school.id, teacherId: teachers[2].id, type: "GOAL", title: "Complete CS curriculum redesign", status: "IN_PROGRESS" },
    ],
  });
  await prisma.messageTemplate.createMany({ data: MESSAGE_TEMPLATES.map((t) => ({ schoolId: school.id, ...t })) });

  // ── Audit history (the seed writes rows directly, so record what an admin would have done) ──
  const auditRows: Array<{ userId: string; action: string; entityType: string; entityId: string | null; before?: object; after: object; createdAt: Date }> = [
    ...teachers.slice(0, 4).map((t, i) => ({ userId: admin.id, action: "teacher.create", entityType: "Teacher", entityId: t.id, after: { name: t.user.name }, createdAt: subDays(today, 30 - i) })),
    { userId: admin.id, action: "academic_year.create", entityType: "AcademicYear", entityId: year.id, after: { name: year.name }, createdAt: subDays(today, 31) },
    { userId: admin.id, action: "timetable.slot.bulk_create", entityType: "TimetableSlot", entityId: null, after: { count: slotRows.length }, createdAt: subDays(today, 29) },
    { userId: admin.id, action: "leave.approve", entityType: "LeaveRequest", entityId: approvedLeave.id, before: { status: "PENDING" }, after: { status: "APPROVED" }, createdAt: subDays(today, 1) },
    { userId: principal.id, action: "leave.reject", entityType: "LeaveRequest", entityId: null, before: { status: "PENDING" }, after: { status: "REJECTED" }, createdAt: subDays(today, 25) },
    { userId: teachers[1].userId, action: "attendance.record", entityType: "AttendanceSession", entityId: null, after: { count: 10, submitted: true }, createdAt: subDays(today, 1) },
    { userId: teachers[0].userId, action: "grades.submit", entityType: "Course", entityId: courses[0].id, after: { count: 10 }, createdAt: subDays(today, 4) },
    { userId: admin.id, action: "user.update", entityType: "User", entityId: teachers[9].userId, before: { isActive: true }, after: { isActive: true, phone: "+1 555 0119" }, createdAt: subDays(today, 3) },
  ];
  await prisma.auditLog.createMany({ data: auditRows.map((r) => ({ schoolId: school.id, ...r, before: r.before ?? undefined })) });

  // ── Notifications ──────────────────────────────────────────────────────
  await prisma.notification.createMany({
    data: [
      ...teachers.map((t) => ({ schoolId: school.id, userId: t.userId, type: "MEETING_INVITE", title: "Invitation: Weekly staff meeting", body: "You have been invited to the weekly staff meeting.", link: `/meetings/${staffMeeting.id}` })),
      { schoolId: school.id, userId: leaveTeacher.userId, type: "LEAVE_APPROVED", title: "Your leave request was approved", link: `/leave/${approvedLeave.id}` },
      { schoolId: school.id, userId: admin.id, type: "LEAVE_REQUESTED", title: `Leave request from ${teachers[5].user.name}`, link: `/admin/leave/${pendingLeave.id}` },
      { schoolId: school.id, userId: admin.id, type: "MAINTENANCE_CREATED", title: "New maintenance request: Gym floor needs cleaning", link: "/maintenance" },
    ],
  });

  console.log(`Seed complete in ${((Date.now() - start) / 1000).toFixed(1)}s.`);
  console.log(`\nDemo accounts (password: ${DEMO_PASSWORD})`);
  console.log(`  SUPER_ADMIN      ${SUPER_ADMIN.email}`);
  console.log(`  PRINCIPAL        principal@edura.dev`);
  console.log(`  SCHOOL_ADMIN     admin@edura.dev, admin2@edura.dev`);
  console.log(`  DEPARTMENT_HEAD  alice.morgan@edura.dev`);
  console.log(`  TEACHER          brian.chen@edura.dev … jamal.wright@edura.dev`);
  console.log(`  STAFF            karen.walsh@edura.dev … olivia.park@edura.dev`);
  console.log(`  STUDENT          student1@edura.dev … student100@edura.dev`);
  console.log(`  PARENT           parent1@edura.dev … parent20@edura.dev`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
