# Permissions

Authorization = **Role + Permission + School scope + optional Department scope**, enforced server-side.

## Roles

`SUPER_ADMIN`, `SCHOOL_ADMIN`, `PRINCIPAL`, `DEPARTMENT_HEAD`, `TEACHER`, `STUDENT`, `PARENT`, `STAFF`
(`User.role`). Every user except `SUPER_ADMIN` belongs to exactly one school.

## Permissions

`lib/permissions/permissions.ts` lists every permission (`teachers:manage`, `attendance:record`,
`grades:lock`, `leave:review`, `support_cases:read_sensitive`, …). `lib/permissions/roles.ts` maps roles to
permission sets:

| Role            | Highlights                                                                                       |
| --------------- | ------------------------------------------------------------------------------------------------ |
| SUPER_ADMIN     | everything, any school                                                                           |
| SCHOOL_ADMIN / PRINCIPAL | everything in their school except student-only actions                                  |
| DEPARTMENT_HEAD | teacher permissions + department management, task assignment, leave visibility, school reports   |
| TEACHER         | own classes: attendance, assignments, grades, lesson plans, tasks, leave requests, messaging     |
| STAFF           | tasks, meetings, bookings, maintenance management, messaging                                     |
| STUDENT         | own schedule, attendance, assignments (submit), grades, events, messages                         |
| PARENT          | linked children's schedule, attendance, assignments, grades, events, messages                    |

`hasPermission(user, p)`, `assertPermission(user, p)`; API routes pass the coarse permission to `withAuth`.

## School scope

`resolveSchoolId(user, explicit?)` returns the caller's school (SUPER_ADMIN may pass one explicitly) and
`assertSchoolAccess(user, schoolId)` guards every loaded record. Cross-school access is impossible by
construction: services never accept a `schoolId` from input without these helpers.

## Object-level rules

* Courses: `assertCourseAccess` — teacher of the course, homeroom teacher, assigned substitute, department head of
  the subject's department, students of the class, guardians of those students, admins.
* Students: `canAccessStudent` / `accessibleStudentWhere` — admins/staff: all; teachers: students in classes they
  teach or homeroom; students: self; parents: linked children.
* Sensitive data: `students:read_sensitive` (medical notes) and `support_cases:read_sensitive` (sensitive case
  descriptions/notes — also visible to the case creator/assignee).
* Grades: only the course teacher or admins enter grades; `grades:lock` (admins) locks/unlocks; locked grades are
  immutable; students/parents only see SUBMITTED/LOCKED grades.
* Report cards: `report_cards:manage` (admins) generates/publishes; homeroom teachers edit comments on drafts; students/parents only see PUBLISHED cards of their own/linked students.
* Leave: reviewers cannot review their own request; department heads see their department's requests.
* Tasks: assigning to others needs `tasks:assign`; department heads only within their department.
* Timetable: teachers see their own schedule and their classes; students their class; parents a child's class.

## Auditing

`lib/audit.ts` records who did what (`action`, `entityType`, `entityId`, before/after) for every important
mutation; `GET /api/audit` (`audit:read`).
