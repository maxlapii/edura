# Database

PostgreSQL 17 with Prisma 7 (`prisma/schema.prisma`, driver adapter `@prisma/adapter-pg`).

## Conventions

* Every table has `id` (cuid), `createdAt`, `updatedAt`.
* School-owned tables carry `schoolId` (indexed) and cascade on school deletion.
* Foreign keys everywhere; unique constraints encode business rules
  (`TimetableSlot` teacher/class/room per day+period, `AttendanceRecord` per session+student,
  `Grade` per assignment/assessment+student, `Substitution` per slot+date, …).
* Date-only values use `@db.Date` and are always written as UTC midnight via `toDateOnly()`; ISO weekday
  (`dayOfWeek`, 1 = Monday) is computed in UTC.
* No soft deletion: history is kept in `AuditLog`, `GradeHistory`, `WorkflowRun`, `JobRun`.
* Transactions wrap multi-step writes (user + profile creation, attendance submission, leave approval, …).

## Model groups

| Group        | Models                                                                                                  |
| ------------ | ------------------------------------------------------------------------------------------------------- |
| Core/auth    | School, User, Session, Account, Verification, AuditLog                                                  |
| People       | Department, Teacher, TeacherSubject, TeacherAvailability, TeacherDuty, Staff, Student, Guardian, StudentGuardian, Document |
| Academic     | AcademicYear, Term, Subject, SchoolClass, Course, Period, TimetableSlot                                  |
| Facilities   | Room, RoomBooking, Equipment, MaintenanceRequest                                                        |
| Attendance   | AttendanceSession, AttendanceRecord                                                                     |
| Assessment   | Assignment, Submission, Assessment, Grade, GradeHistory, ReportCard                                     |
| Teaching     | LessonPlan, Task                                                                                        |
| Leave        | LeaveRequest, Substitution                                                                              |
| Operations   | Meeting, MeetingParticipant, MeetingActionItem, Event, EventParticipant, Announcement, AnnouncementRead |
| Students     | SupportCase, SupportCaseNote, DisciplineIncident                                                        |
| Comms        | Message, MessageRecipient, MessageTemplate, Notification                                                |
| Automation   | WorkflowRule, WorkflowRun, Approval, JobRun                                                             |
| PD           | Certification, ProfessionalDevelopment                                                                  |

## Migrations

```bash
pnpm prisma migrate dev --name <change>   # create + apply locally
pnpm prisma migrate deploy                # apply in CI/production
pnpm prisma generate                      # regenerate the client (generated/prisma, git-ignored)
```

## Seed

`pnpm db:seed` (also run by `prisma migrate reset`) creates the demo school "Greenfield Secondary School" with
1 academic year, 3 terms, principal, 2 admins, department head, 10 teachers, 5 staff, 100 students, 20 guardians,
5 departments, 10 classes, 15 subjects, 60 courses, a conflict-free timetable, attendance history, assignments,
submissions, assessments, grades, lesson plans, leave requests, substitutions, meetings, events, maintenance
requests, tasks, announcements, support cases, incidents, bookings, certifications and notifications. Running it
again deletes and re-creates the demo school.
