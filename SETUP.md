# Setting up Edura

Everything you need to run, test and deploy Edura. For what the product does, see the [README](README.md).

- [Requirements](#requirements)
- [Quick start](#quick-start)
- [Demo accounts](#demo-accounts)
- [Environment variables](#environment-variables)
- [Database, migrations and seed data](#database-migrations-and-seed-data)
- [Everyday commands](#everyday-commands)
- [Testing](#testing)
- [Scheduled jobs](#scheduled-jobs)
- [Optional features](#optional-features)
- [AI assistant](#ai-assistant)
- [Deployment](#deployment)
- [Troubleshooting](#troubleshooting)
- [Project layout](#project-layout)
- [Further documentation](#further-documentation)

## Requirements

| Tool | Version |
| --- | --- |
| Node.js | 20 or newer (developed on 22+) |
| pnpm | 10 |
| Docker | Any recent Docker Desktop or Engine (for PostgreSQL) |
| PostgreSQL | 17 (provided by `docker-compose.yml`) |

## Quick start

```bash
pnpm install
cp .env.example .env
docker compose up -d db
pnpm prisma migrate dev
pnpm db:seed
pnpm dev
```

Open http://localhost:3000 and sign in with one of the [demo accounts](#demo-accounts).

`pnpm prisma migrate dev` creates the schema and generates the Prisma client into `generated/prisma`
(git-ignored). Run `pnpm prisma generate` again whenever you pull schema changes.

## Demo accounts

The seed creates *Greenfield Secondary School* with realistic data. Every account uses the password
`Password123!`.

| Role | Email |
| --- | --- |
| Platform super admin | `superadmin@edura.dev` |
| Principal | `principal@edura.dev` |
| School administrator | `admin@edura.dev`, `admin2@edura.dev` |
| Department head | `alice.morgan@edura.dev` |
| Teacher | `brian.chen@edura.dev` … `jamal.wright@edura.dev` |
| Staff | `karen.walsh@edura.dev` … `olivia.park@edura.dev` |
| Student | `student1@edura.dev` … `student100@edura.dev` |
| Parent | `parent1@edura.dev` … `parent20@edura.dev` |

## Environment variables

Copy [`.env.example`](.env.example) to `.env`. Only the first three are required.

| Variable | Required | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | yes | PostgreSQL connection string |
| `BETTER_AUTH_SECRET` | yes | Session signing secret, at least 32 random characters |
| `BETTER_AUTH_URL` / `NEXT_PUBLIC_APP_URL` | yes | Public URL of the app, e.g. `http://localhost:3000` |
| `TEST_DATABASE_URL` | for tests | Database used by integration tests (truncated before every test) |
| `E2E_DATABASE_URL` | for tests | Database used by Playwright end-to-end tests |
| `ANTHROPIC_API_KEY` | no | Enables the AI assistant |
| `ANTHROPIC_MODEL` | no | Overrides the assistant's model |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `EMAIL_FROM` | no | Real email delivery; without them emails are logged to the console |
| `CRON_SECRET` | no | Bearer token that lets a scheduler call `POST /api/jobs` |

## Database, migrations and seed data

```bash
pnpm prisma migrate dev --name <change>   # create and apply a migration locally
pnpm prisma migrate deploy                # apply migrations in CI or production
pnpm db:seed                              # re-create the demo school (deletes and rebuilds it)
pnpm db:reset                             # drop everything, migrate and seed
pnpm db:studio                            # browse data in Prisma Studio
```

The seed is idempotent: running it again deletes the demo school and builds it from scratch, so anything you
changed in the demo school is lost. See [docs/database.md](docs/database.md) for the schema overview.

## Everyday commands

| Command | What it does |
| --- | --- |
| `pnpm dev` | Development server on port 3000 |
| `pnpm build` / `pnpm start` | Production build / production server |
| `pnpm typecheck` | TypeScript check |
| `pnpm lint` | ESLint |
| `pnpm test` | All Vitest projects (unit, UI and integration) |
| `pnpm test:unit` | Pure business-logic tests |
| `pnpm test:integration` | API and database tests |
| `pnpm test:coverage` | All Vitest projects with coverage thresholds |
| `pnpm test:e2e` | Playwright end-to-end journey |
| `pnpm jobs:run [name]` | Run scheduled jobs now (all, or one by name) |

## Testing

Create the test databases once:

```bash
docker compose exec db psql -U edura -c "CREATE DATABASE edura_test;" -c "CREATE DATABASE edura_e2e;"
```

Then:

```bash
pnpm test:coverage
pnpm test:e2e
```

- **Unit and UI tests** need no database.
- **Integration tests** use `TEST_DATABASE_URL` and truncate it before every test.
- **End-to-end tests** start their own server on port 3100 against `E2E_DATABASE_URL`. Stop any running
  `pnpm dev` first: Next.js allows only one development server per project folder.

Coverage gates (enforced in CI): 80% overall, 95% for permission code, 90% for workflow code. Details in
[docs/testing.md](docs/testing.md).

## Scheduled jobs

Reminders and escalations (overdue tasks and assignments, expiring certifications, grade reminders, meeting
reminders, leave status) run as database-backed jobs. Trigger them from cron:

```bash
pnpm jobs:run
```

or from a platform scheduler:

```bash
curl -X POST -H "Authorization: Bearer $CRON_SECRET" https://your-host/api/jobs
```

Once a day is enough. See [docs/workflows.md](docs/workflows.md).

## Optional features

Extras that are not part of the core product are switched off by default: report cards, professional
development, student support cases, discipline, the approvals inbox, the automation-rule editor, the department
dashboard, the staff directory and message templates.

Turn one on in [`lib/features.ts`](lib/features.ts) by setting `enabled: true`. Its menu items, pages, API routes
and dashboard pieces come back. Switched-off features return 404, enforced in [`proxy.ts`](proxy.ts). The default
automation rules run either way.

## AI assistant

Set `ANTHROPIC_API_KEY` to enable it. Without a key the assistant page explains that it is off and the rest of
Edura works normally. The assistant only uses approved, permission-checked tools and never changes records. See
[docs/ai.md](docs/ai.md).

## Deployment

Edura runs as one application server plus PostgreSQL.

```bash
docker compose --profile prod up -d --build
```

The `app` container builds the standalone Next.js server and applies migrations on start. Set
`BETTER_AUTH_SECRET`, `BETTER_AUTH_URL` and `NEXT_PUBLIC_APP_URL` for your domain. A manual (non-Docker) route and
backup notes are in [docs/deployment.md](docs/deployment.md).

## Troubleshooting

**"Can't reach database server at localhost:5432".** Docker isn't running or the container stopped. Start
Docker, then run `docker compose up -d db`. Your data is kept in the `edura_pgdata` volume.

**"Another next dev server is already running".** Next.js allows one development server per folder. The message
prints the process id: stop it (`kill <pid>`) and start again.

**Sign-in or sign-out returns 403 on a different port.** Sessions are bound to `BETTER_AUTH_URL`. Open the app on
that exact URL, or change the variable and restart.

**"Invalid email or password" for a user created by a script.** Credential accounts must have
`accountId` equal to the user's id. Create users with `createUserWithPassword` from
`modules/users/service.ts`, which does this for you.

**Prisma client errors after pulling changes.** Run `pnpm prisma generate` and, if the schema changed,
`pnpm prisma migrate dev`.

## Project layout

```
app/          Pages (app/(auth), app/(dashboard)) and API route handlers (app/api)
components/   Shared UI components, charts and the app shell
lib/          Infrastructure: database, auth, permissions, API helpers, notifications, workflows, jobs, audit, AI
modules/      Business modules, one folder per domain (schema.ts, service.ts, pure helpers)
prisma/       Schema, migrations and seed data
tests/        Unit, integration and end-to-end tests
docs/         Architecture and reference documentation
assets/       Logo and screenshots used in the README
```

## Further documentation

| Document | Covers |
| --- | --- |
| [Architecture](docs/architecture.md) | Modular monolith, request flow, business rules |
| [Database](docs/database.md) | Schema overview, conventions, migrations, seed |
| [Permissions](docs/permissions.md) | Roles, permission matrix, object-level rules |
| [Workflows](docs/workflows.md) | Automation engine, triggers, actions, jobs |
| [Testing](docs/testing.md) | Test layers, coverage gates |
| [AI](docs/ai.md) | Assistant architecture and safety rules |
| [Deployment](docs/deployment.md) | Docker, environment, backups |
| [Conventions](docs/conventions.md) | How to add code |
