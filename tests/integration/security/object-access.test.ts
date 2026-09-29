import { describe, expect, it } from "vitest";
import { api, createSchoolFixture, createStudent, createTeacher, prisma, signIn } from "../helpers";
import { getStudent } from "@/modules/students/service";
import { getTeacher } from "@/modules/teachers/service";
import { weeklySchedule } from "@/modules/timetable/service";
import { GET as getStudentRoute, PATCH as patchStudentRoute } from "@/app/api/students/[id]/route";
import { GET as getTeacherRoute } from "@/app/api/teachers/[id]/route";

describe("object-level access: students", () => {
  it("a student can read only their own profile", async () => {
    const f = await createSchoolFixture();
    const [me, other] = f.students;
    const cookie = await signIn(me.user!.email);
    const own = await api(getStudentRoute, { cookie, params: { id: me.student.id } });
    expect(own.status).toBe(200);
    expect(own.data).toMatchObject({ id: me.student.id, firstName: "Kid1" });
    const foreign = await api(getStudentRoute, { cookie, params: { id: other.student.id } });
    expect(foreign.status).toBe(403);
    expect(foreign.error?.code).toBe("FORBIDDEN");
    const edit = await api(patchStudentRoute, { method: "PATCH", cookie, params: { id: me.student.id }, body: { firstName: "Renamed" } });
    expect(edit.status).toBe(403);
    expect((await prisma.student.findUniqueOrThrow({ where: { id: me.student.id } })).firstName).toBe("Kid1");
  });

  it("a parent can read a linked child but not another student", async () => {
    const f = await createSchoolFixture();
    const cookie = await signIn(f.guardian.user.email);
    const child = await api(getStudentRoute, { cookie, params: { id: f.students[0].student.id } });
    expect(child.status).toBe(200);
    expect((child.data as { guardians: { guardianId: string }[] }).guardians.map((g) => g.guardianId)).toEqual([f.guardian.guardian.id]);
    const stranger = await api(getStudentRoute, { cookie, params: { id: f.students[1].student.id } });
    expect(stranger.status).toBe(403);
    await expect(getStudent(f.guardian.auth, f.students[2].student.id)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("a teacher can read students in classes they teach or homeroom, not in unrelated classes", async () => {
    const f = await createSchoolFixture();
    const cls2 = await prisma.schoolClass.create({ data: { schoolId: f.school.id, academicYearId: f.year.id, name: "10B" } });
    const unrelated = await createStudent(f.school.id, cls2.id, { withLogin: false });
    const unassigned = await createStudent(f.school.id, null, { withLogin: false });

    expect((await getStudent(f.teacher.auth, f.students[1].student.id)).id).toBe(f.students[1].student.id);
    await expect(getStudent(f.teacher.auth, unrelated.student.id)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(getStudent(f.teacher.auth, unassigned.student.id)).rejects.toMatchObject({ code: "FORBIDDEN" });
    // teacher2 teaches nothing yet
    await expect(getStudent(f.teacher2.auth, f.students[0].student.id)).rejects.toMatchObject({ code: "FORBIDDEN" });
    const viaRoute = await api(getStudentRoute, { cookie: await signIn(f.teacher2.user.email), params: { id: f.students[0].student.id } });
    expect(viaRoute.status).toBe(403);

    // Teaching a course in 10B grants access; homeroom alone does too.
    await prisma.course.create({ data: { schoolId: f.school.id, academicYearId: f.year.id, classId: cls2.id, subjectId: f.otherSubject.id, teacherId: f.teacher2.teacher.id } });
    expect((await getStudent(f.teacher2.auth, unrelated.student.id)).id).toBe(unrelated.student.id);
    const homeroom = await createTeacher(f.school.id);
    await prisma.schoolClass.update({ where: { id: cls2.id }, data: { homeroomTeacherId: homeroom.teacher.id } });
    expect((await getStudent(homeroom.auth, unrelated.student.id)).id).toBe(unrelated.student.id);
    await expect(getStudent(homeroom.auth, f.students[0].student.id)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("medicalNotes are hidden from teachers but visible to admins, the student and their parent", async () => {
    const f = await createSchoolFixture();
    const s = f.students[0];
    await prisma.student.update({ where: { id: s.student.id }, data: { medicalNotes: "Asthma inhaler in bag" } });
    expect((await getStudent(f.teacher.auth, s.student.id)).medicalNotes).toBeNull();
    expect((await getStudent(f.admin, s.student.id)).medicalNotes).toBe("Asthma inhaler in bag");
    expect((await getStudent(s.auth!, s.student.id)).medicalNotes).toBe("Asthma inhaler in bag");
    expect((await getStudent(f.guardian.auth, s.student.id)).medicalNotes).toBe("Asthma inhaler in bag");
    const viaRoute = await api(getStudentRoute, { cookie: await signIn(f.teacher.user.email), params: { id: s.student.id } });
    expect(viaRoute.status).toBe(200);
    expect((viaRoute.data as { medicalNotes: string | null }).medicalNotes).toBeNull();
  });
});

describe("object-level access: teachers", () => {
  it("a teacher reads their own emergency contact and certifications but not a colleague's", async () => {
    const f = await createSchoolFixture();
    await prisma.teacher.update({ where: { id: f.teacher2.teacher.id }, data: { emergencyContactName: "Jane Two", emergencyContactPhone: "555-0002" } });
    await prisma.teacher.update({ where: { id: f.teacher.teacher.id }, data: { emergencyContactName: "John One", emergencyContactPhone: "555-0001" } });
    await prisma.certification.create({ data: { schoolId: f.school.id, teacherId: f.teacher2.teacher.id, name: "First Aid" } });

    const colleague = await getTeacher(f.teacher.auth, f.teacher2.teacher.id);
    expect(colleague).toMatchObject({ id: f.teacher2.teacher.id, emergencyContactName: null, emergencyContactPhone: null, certifications: [], professionalDev: [] });
    expect(colleague.user.name).toBe("Teacher Two");

    const self = await getTeacher(f.teacher2.auth, f.teacher2.teacher.id);
    expect(self).toMatchObject({ emergencyContactName: "Jane Two", emergencyContactPhone: "555-0002" });
    expect(self.certifications.map((c) => c.name)).toEqual(["First Aid"]);

    const byAdmin = await getTeacher(f.admin, f.teacher2.teacher.id);
    expect(byAdmin.emergencyContactName).toBe("Jane Two");
    expect(byAdmin.certifications).toHaveLength(1);

    const viaRoute = await api(getTeacherRoute, { cookie: await signIn(f.teacher.user.email), params: { id: f.teacher2.teacher.id } });
    expect(viaRoute.status).toBe(200);
    expect(viaRoute.data).toMatchObject({ emergencyContactName: null, certifications: [] });
    const ownRoute = await api(getTeacherRoute, { cookie: await signIn(f.teacher.user.email), params: { id: f.teacher.teacher.id } });
    expect(ownRoute.data).toMatchObject({ emergencyContactName: "John One" });

    // Students and parents have no teachers:read at all.
    await expect(getTeacher(f.students[0].auth!, f.teacher.teacher.id)).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect((await api(getTeacherRoute, { cookie: await signIn(f.guardian.user.email), params: { id: f.teacher.teacher.id } })).status).toBe(403);
  });
});

describe("object-level access: sensitive teacher data in schedules", () => {
  it("a student's timetable does not expose the teacher's emergency contact", async () => {
    const f = await createSchoolFixture();
    await prisma.teacher.update({ where: { id: f.teacher.teacher.id }, data: { emergencyContactName: "John One", emergencyContactPhone: "555-0001" } });
    const slots = await weeklySchedule(f.students[0].auth!, {});
    expect(slots).toHaveLength(7);
    const teacher = slots[0].course.teacher as Record<string, unknown>;
    expect(teacher.user).toMatchObject({ id: f.teacher.user.id, name: "Teacher One" });
    expect(teacher.emergencyContactName ?? null).toBeNull();
    expect(teacher.emergencyContactPhone ?? null).toBeNull();
  });
});
