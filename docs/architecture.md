# Architecture

Edura is a **modular monolith**: one Next.js application that contains the UI, the HTTP API and all business
logic, backed by a single PostgreSQL database. There are no microservices, queues or caches to operate.

## Layers

```
Browser ──► Next.js App Router
             ├─ Server Components (app/(dashboard)/**)  ──► modules/*/service.ts ──► Prisma ──► PostgreSQL
             ├─ Route Handlers    (app/api/**)          ──► modules/*/service.ts ──► Prisma ──► PostgreSQL
             └─ Client Components (forms)  ──fetch──► app/api/**
```

* **Pages** are Server Components that call module services directly (no HTTP hop) and render with the shared
  component library in `components/ui`.
* **Route Handlers** (`app/api/**`) expose the same services over JSON for client components, integrations and
  tests. They only parse input (Zod) and delegate — no business logic.
* **Modules** (`modules/<domain>/`) hold the business logic: `schema.ts` (Zod input schemas), `service.ts`
  (permission + scope checks, Prisma access, audit, notifications, workflow dispatch) and pure helpers such as
  `timetable/conflicts.ts`, `timetable/workload.ts`, `attendance/stats.ts`, `grades/calculations.ts`,
  `substitution/eligibility.ts`, `leave/impact.ts`, `facilities/booking.ts`.
* **lib/** contains cross-cutting infrastructure:
  * `lib/db` – Prisma client (pg driver adapter)
  * `lib/auth` – better-auth configuration, session helpers, `AuthUser`
  * `lib/permissions` – role → permission matrix and scope helpers
  * `lib/api` – `withAuth` route wrapper, error mapping, parsing helpers
  * `lib/notifications` – in-app notifications + email transport
  * `lib/workflows` – rule evaluation (`rules.ts`), engine (`engine.ts`), default rules
  * `lib/jobs` – database-backed scheduled jobs
  * `lib/audit` – audit log writer
  * `lib/ai` – Anthropic client and the approved tool registry
  * `lib/reports` – CSV export

## Request lifecycle (API)

1. `withAuth` resolves the session (better-auth cookie) and loads the `AuthUser` including profile ids
   (`teacherId`, `studentId`, `guardianId`, `staffId`, `departmentId`).
2. The coarse permission (`teachers:manage`, …) is checked from the role matrix.
3. The service re-checks the permission, resolves the caller's school (`resolveSchoolId`) and applies
   object-level rules (own courses, own children, own records…).
4. Mutations run in a transaction where multi-step, write an audit entry, create notifications and/or dispatch a
   workflow trigger.
5. Errors are `AppError`s mapped to `{ error: { code, message, details } }` with the right HTTP status.

## Automation

Business events call `dispatch(trigger, schoolId, payload)`. Active `WorkflowRule`s for the school and trigger are
evaluated (`conditions`) and their `actions` executed (notification, email, task, alert, approval). Every run is
recorded in `WorkflowRun`. Scheduled jobs (`lib/jobs`) generate time-based triggers (overdue tasks/assignments,
expiring certifications, grade reminders, meeting reminders, leave status sync).

## Dashboards

`modules/dashboards` composes existing services into role-specific views (teacher, admin, principal, department
head, student, parent, staff). `GET /api/dashboard` and `/dashboard` use `dashboardForUser`.

## Key business rules (server side)

| Rule                                                    | Where                                                                                     |
| ------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Teacher/class/room cannot be double-booked              | `modules/timetable` (`findConflicts`) + unique indexes on `TimetableSlot`                 |
| Room bookings cannot overlap                            | `modules/facilities/booking.ts`                                                           |
| One attendance record per student per session          | `@@unique([sessionId, studentId])` + upsert in `recordAttendance`                         |
| Only the course teacher/admin can grade; locked grades are immutable | `modules/grades/service.ts`                                                  |
| Approved leave identifies affected lessons and creates substitution needs | `modules/leave/service.ts`                                              |
| A substitute cannot be assigned to a conflicting slot   | `modules/substitution/eligibility.ts` + `assignSubstitute`                                |
| School isolation                                        | `resolveSchoolId` / `assertSchoolAccess` in every service                                 |
| Report cards are snapshots of SUBMITTED/LOCKED grades; published cards are immutable | `modules/reportCards/service.ts` |
| Parent access limited to linked children; student to self | `modules/students/service.ts` (`canAccessStudent`, `accessibleStudentWhere`)           |
