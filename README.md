# Edura

Edura is a lightweight school & teacher management platform: teacher productivity, school administration,
academic operations, student management, communication, workflow automation and practical AI assistance —
built as a modular monolith on Next.js, TypeScript, Prisma and PostgreSQL.

> Enter information once → reuse it everywhere → automate repetitive work → give teachers and administrators useful tools.

## Stack

| Layer          | Choice                                                            |
| -------------- | ----------------------------------------------------------------- |
| Frontend       | Next.js 16 (App Router, Server Components), React 19, Tailwind 4  |
| API            | Next.js Route Handlers + Zod validation                           |
| Database       | PostgreSQL 17 + Prisma 7                                          |
| Authentication | better-auth (email/password, DB sessions, password reset)         |
| Jobs           | Database-backed jobs triggered by cron / `POST /api/jobs`         |
| AI             | Anthropic Claude via approved, permission-checked tools           |
| Tests          | Vitest (unit + integration), Playwright (E2E), coverage gates     |
| Deployment     | Docker + PostgreSQL + one app server                              |

## Quick start

```bash
pnpm install
cp .env.example .env           # adjust secrets if you like
docker compose up -d db        # PostgreSQL on localhost:5432
pnpm prisma migrate dev        # create the schema (also generates the client)
pnpm db:seed                   # realistic demo data + demo accounts
pnpm dev                       # http://localhost:3000
```

Create the test databases once (integration + E2E tests use their own databases):

```bash
docker compose exec db psql -U edura -c "CREATE DATABASE edura_test;" -c "CREATE DATABASE edura_e2e;"
```

### Demo accounts (password `Password123!`)

| Role            | Email                                            |
| --------------- | ------------------------------------------------ |
| SUPER_ADMIN     | superadmin@edura.dev                             |
| PRINCIPAL       | principal@edura.dev                              |
| SCHOOL_ADMIN    | admin@edura.dev, admin2@edura.dev                |
| DEPARTMENT_HEAD | alice.morgan@edura.dev                           |
| TEACHER         | brian.chen@edura.dev … jamal.wright@edura.dev    |
| STAFF           | karen.walsh@edura.dev … olivia.park@edura.dev    |
| STUDENT         | student1@edura.dev … student100@edura.dev        |
| PARENT          | parent1@edura.dev … parent20@edura.dev           |

## Scripts

| Script                  | What it does                                                  |
| ----------------------- | ------------------------------------------------------------- |
| `pnpm dev` / `build` / `start` | Next.js development server / production build / server |
| `pnpm typecheck`        | `tsc --noEmit`                                                |
| `pnpm lint`             | ESLint                                                        |
| `pnpm test`             | All Vitest projects (unit, ui, integration)                   |
| `pnpm test:unit`        | Pure business-logic tests                                     |
| `pnpm test:integration` | API → database tests (needs `TEST_DATABASE_URL`)              |
| `pnpm test:coverage`    | Vitest with coverage thresholds (fails below targets)         |
| `pnpm test:e2e`         | Playwright critical journeys (needs `E2E_DATABASE_URL`)       |
| `pnpm db:migrate`       | `prisma migrate dev`                                          |
| `pnpm db:seed`          | Seed demo data (idempotent: re-creates the demo school)       |
| `pnpm db:reset`         | Drop, migrate and seed                                        |
| `pnpm jobs:run [name]`  | Run scheduled jobs (all, or one by name)                      |

## Environment variables

See [`.env.example`](.env.example). `DATABASE_URL`, `BETTER_AUTH_SECRET` and `BETTER_AUTH_URL` are required;
`TEST_DATABASE_URL` / `E2E_DATABASE_URL` for tests; `ANTHROPIC_API_KEY` enables the AI assistant; `SMTP_*`
enables real email (otherwise emails are logged); `CRON_SECRET` protects `POST /api/jobs`.

## Documentation

- [Architecture](docs/architecture.md) — modular monolith, module layout, request flow
- [Database](docs/database.md) — schema overview, conventions, migrations, seed
- [Permissions](docs/permissions.md) — roles, permission matrix, object-level rules
- [Workflows](docs/workflows.md) — automation engine, triggers, actions, jobs
- [Testing](docs/testing.md) — test pyramid, coverage gates, how to run
- [AI](docs/ai.md) — assistant architecture and safety rules
- [Deployment](docs/deployment.md) — Docker, environment, migrations, scheduling jobs
- [Conventions](docs/conventions.md) — how to add code

## Project layout

```
app/                Pages (app/(auth), app/(dashboard)) and API route handlers (app/api)
components/         UI component library and layout
lib/                Infrastructure: db, auth, permissions, api, notifications, workflows, jobs, audit, ai
modules/            Business modules (schema.ts + service.ts per domain)
prisma/             Schema, migrations, seed
tests/              unit / integration / e2e
docs/               Documentation
```
