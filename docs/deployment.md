# Deployment

Edura runs as **one application server + PostgreSQL**.

## Docker

```bash
cp .env.example .env         # set BETTER_AUTH_SECRET (32+ random chars), BETTER_AUTH_URL, NEXT_PUBLIC_APP_URL
docker compose --profile prod up -d --build
```

The `app` service builds the standalone Next.js server, runs `prisma migrate deploy` on start and listens on
port 3000; `db` is PostgreSQL 17 with a persistent volume.

## Manual

```bash
pnpm install --frozen-lockfile
pnpm prisma generate
pnpm build
pnpm prisma migrate deploy
pnpm start
```

## Environment

| Variable                    | Purpose                                                  |
| --------------------------- | -------------------------------------------------------- |
| `DATABASE_URL`              | PostgreSQL connection string                             |
| `BETTER_AUTH_SECRET`        | Session signing secret (required, ≥ 32 chars)            |
| `BETTER_AUTH_URL`, `NEXT_PUBLIC_APP_URL` | Public URL of the app                       |
| `SMTP_HOST/PORT/USER/PASS`, `EMAIL_FROM` | Email delivery (logged to console when unset) |
| `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL`  | AI assistant                                   |
| `CRON_SECRET`               | Bearer token for `POST /api/jobs`                        |

## Scheduled jobs

Schedule `pnpm jobs:run` daily (cron/systemd timer) or call `POST /api/jobs` with `Authorization: Bearer $CRON_SECRET`
from your platform scheduler. See `docs/workflows.md`.

## First school

Sign in as a SUPER_ADMIN (seeded `superadmin@edura.dev`, or create one with `createUserWithPassword` in a script),
create the school under Admin → Schools, then create the school administrator under Admin → Users. Default periods
and automation rules are installed automatically.

## Backups & files

Back up PostgreSQL regularly (`pg_dump`). File attachments are stored by URL (S3-compatible storage recommended);
there is no custom file service.
