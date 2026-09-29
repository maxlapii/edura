# Testing

Testing is a first-class requirement. CI fails when any gate fails.

| Level        | Tool                         | Location             | Database                          |
| ------------ | ---------------------------- | -------------------- | --------------------------------- |
| Unit         | Vitest                       | `tests/unit`         | none (pure functions, mocks)      |
| UI           | Vitest + Testing Library     | `tests/unit/**/*.tsx`| none                              |
| Integration  | Vitest                       | `tests/integration`  | `TEST_DATABASE_URL` (truncated before every test) |
| E2E          | Playwright                   | `tests/e2e`          | `E2E_DATABASE_URL` (fresh data per run) |

```bash
pnpm test:unit
pnpm test:integration          # needs the test database
pnpm test:coverage             # all Vitest projects + thresholds
pnpm test:e2e                  # starts the app on :3100 against the E2E database
```

Next.js 16 allows one `next dev` server per project directory: stop any running dev server before `pnpm test:e2e`
(the Playwright web server starts its own on port 3100).

## Coverage gates (`vitest.config.ts`)

Overall ≥ 80% lines/statements/functions (70% branches), `lib/permissions/**` ≥ 95%, `lib/workflows/**` ≥ 90%.
Coverage covers `lib/**`, `modules/**`, `app/api/**` (AI client excluded).

## What is covered

* **Unit**: permission matrix and scope helpers, workflow rule evaluation/interpolation/recipients, timetable
  conflicts, workload calculation, attendance statistics and repeated-absence detection, grade calculations,
  substitute eligibility ranking, leave impact dates, date helpers, CSV export, API handler error mapping.
* **Integration** (API → database): authentication & sessions, tenant isolation, role permissions, object-level
  access, people & structure CRUD, timetable conflict enforcement, attendance recording + automation, assignments →
  submissions → grades, lesson plans, tasks, leave → approval → substitutions, workflow engine & admin, jobs,
  notifications, meetings, events, announcements, calendar, facilities & maintenance, student support & discipline,
  messaging, reports, dashboards.
* **E2E**: the required MVP journey (school setup → teacher schedule → attendance → parent notification →
  assignment → submission → grading → leave → approval → substitute) through the real UI.

## Writing tests

See `docs/conventions.md`. Integration fixtures live in `tests/integration/helpers.ts`
(`createSchoolFixture`, `createOtherSchool`, `asUser`, `signIn`, `api`). Emails sent during tests are captured
in `emailOutbox` (`tests/setup/integration.ts`).
