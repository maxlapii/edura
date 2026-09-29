# Edura engineering conventions

Read this before adding code. It keeps the modular monolith consistent.

## Layout

```
app/                Next.js App Router (UI pages + app/api route handlers)
components/         Reusable UI components (no business logic)
lib/                Cross-cutting infrastructure (db, auth, permissions, api, notifications, workflows, audit)
modules/<name>/     One folder per business domain:
   schema.ts        Zod input schemas (+ exported input types)
   service.ts       Business logic: permission + scope checks, Prisma access, audit, notifications
   index.ts         `export * from "./schema"; export * from "./service";`
   <pure>.ts        Pure calculation helpers (no I/O) – unit-tested exhaustively
prisma/             schema.prisma, migrations, seed.ts
tests/unit          Vitest, pure logic (no DB)
tests/integration   Vitest, hits the test database (TEST_DATABASE_URL); DB is truncated before every test
tests/e2e           Playwright
```

## Services

* Signature: `async function doThing(user: AuthUser, ...args)`. The first argument is always the authenticated principal (`lib/auth/types.ts`).
* Start with `assertPermission(user, "<perm>")` (coarse, role-based) and then object-level checks
  (`assertSchoolAccess`, `assertCourseAccess`, `assertStudentAccess`, ownership …).
* Resolve the school with `resolveSchoolId(user, explicitSchoolId?)`. Never trust a `schoolId` from input without it.
* Throw `AppError` (`lib/utils/errors.ts`): `AppError.notFound("Teacher")`, `AppError.forbidden()`, `AppError.conflict(msg, details)`, `AppError.validation(msg, details)`.
* Multi-step writes use `prisma.$transaction`.
* Call `audit({ user, schoolId, action: "entity.verb", entityType, entityId, before, after })` after mutations of important records.
* Notifications: `notify({ schoolId, userId, type, title, body, link, email })` from `lib/notifications`. Automation goes through
  `dispatch(trigger, schoolId, payload)` from `lib/workflows/engine` — never hard-code what a configurable rule should do.
* Keep Prisma `include` objects as module-level constants with `satisfies Prisma.XInclude`.
* Dates: date-only columns (`@db.Date`) are always written through `toDateOnly()`; ISO weekday via `dayOfWeek()` (1 = Monday).

## Route handlers (`app/api/**/route.ts`)

```ts
import { withAuth, parseBody, parseQuery, created, noContent } from "@/lib/api";
import { createTeacherSchema, listTeachersSchema, createTeacher, listTeachers } from "@/modules/teachers";

export const GET = withAuth(async ({ req, user }) => listTeachers(user, parseQuery(req, listTeachersSchema)), { permission: "teachers:read" });
export const POST = withAuth(async ({ req, user }) => created(await createTeacher(user, await parseBody(req, createTeacherSchema))), { permission: "teachers:manage" });
```

* `withAuth` authenticates, checks the coarse permission, awaits `params`, and maps errors to JSON. Return a plain value → `{ data }`
  with 200; use `created()` for 201 and `noContent()` for 204.
* Dynamic segments: `app/api/teachers/[id]/route.ts` → `({ params }) => params.id`.
* Response envelope: success `{ data }`, error `{ error: { code, message, details } }` with HTTP status 401/403/404/409/422/400/500.
* Query params are parsed with Zod (`parseQuery`), bodies with `parseBody`. Never read `req.json()` directly.
* Route files contain no business logic — only parsing and delegation.

## UI

* Server Components by default; fetch through services directly (`getCurrentUser()` from `lib/auth/session`), not through the HTTP API.
* Client Components only for interactivity; they call `/api/...` with `fetch` and `credentials: "same-origin"`.
* Use the shared components in `components/ui` (Button, Card, Table, Badge, Input, Select, PageHeader…).

## Tests

* Unit tests: pure functions (`modules/*/calculations.ts`, `conflicts.ts`, `workload.ts`, `stats.ts`, `eligibility.ts`, `lib/workflows/rules.ts`, `lib/permissions`).
* Integration tests: call services with a fabricated `AuthUser` and/or call route handlers with `NextRequest`; use
  `tests/integration/helpers.ts` (`createSchoolFixture`, `asUser`, `api()`).
* Security tests live in `tests/integration/security/*` and must cover tenant isolation, role permissions and object-level access.
