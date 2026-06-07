# Local Development

This guide describes how to run the HRM API, web app, PostgreSQL database, and email worker locally.

## Prerequisites

- Node.js 22+
- pnpm 10+
- Docker Desktop or another PostgreSQL instance

## Install Dependencies

```bash
pnpm install
```

If pnpm is not available through Corepack, use:

```bash
npx pnpm@10.7.0 install
```

## Start PostgreSQL With Docker

Start Docker Desktop first, then run:

```bash
docker run --name hrm-postgres \
  -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_USER=postgres \
  -e POSTGRES_DB=hrm \
  -p 5432:5432 \
  -d postgres:16
```

If the container already exists:

```bash
docker start hrm-postgres
```

Database URL:

```text
postgresql://postgres:postgres@localhost:5432/hrm?schema=public
```

## Environment

Create `.env` from `.env.example`:

```bash
cp .env.example .env
```

For local development, the important values are:

```text
PORT=3000
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/hrm?schema=public
BETTER_AUTH_SECRET=replace-with-a-random-32-byte-secret
BETTER_AUTH_URL=http://localhost:3000
EMAIL_PROVIDER=log
```

## Prisma

Generate the Prisma client:

```bash
pnpm prisma:generate
```

Apply migrations:

```bash
pnpm prisma:migrate
```

For an already-created local database where you only need to apply committed migrations:

```bash
pnpm prisma migrate deploy
```

## Start The API

```bash
pnpm dev
```

The API listens on:

```text
http://localhost:3000
```

Health check:

```bash
curl http://localhost:3000/api/v1/health
```

Expected response:

```json
{
  "status": "ok"
}
```

Database health check:

```bash
curl http://localhost:3000/api/v1/health/db
```

Expected response:

```json
{
  "status": "ok",
  "database": "up"
}
```

## Start The Email Worker

In a second terminal:

```bash
pnpm worker:email
```

With `EMAIL_PROVIDER=log`, emails are logged instead of delivered.

## Start The Web App

In a third terminal:

```bash
pnpm dev:web
```

The web app listens on:

```text
http://localhost:5173
```

## Windows Direct Commands

If pnpm shims are unavailable, these direct commands work from the repo root after dependencies are installed:

```powershell
$env:DATABASE_URL='postgresql://postgres:postgres@localhost:5432/hrm?schema=public'
$env:BETTER_AUTH_SECRET='local-dev-secret-at-least-32-characters'
$env:BETTER_AUTH_URL='http://localhost:3000'
$env:EMAIL_PROVIDER='log'
node --import tsx src/index.ts
```

Email worker:

```powershell
$env:DATABASE_URL='postgresql://postgres:postgres@localhost:5432/hrm?schema=public'
$env:BETTER_AUTH_SECRET='local-dev-secret-at-least-32-characters'
$env:BETTER_AUTH_URL='http://localhost:3000'
$env:EMAIL_PROVIDER='log'
node --import tsx src/workers/email.ts
```

Web app:

```powershell
cd apps/web
.\node_modules\.bin\vite.CMD --host 127.0.0.1
```

## Tests

Full test suite:

```bash
pnpm test
```

The full suite requires a reachable database at `DATABASE_URL`.

Email-focused tests:

```bash
pnpm vitest run tests/email.service.test.ts tests/email.routes.test.ts tests/jobs.email-automation.test.ts --pool threads
```

Build check:

```bash
pnpm build
```

Direct Windows equivalents:

```powershell
.\node_modules\.bin\tsc.CMD -p tsconfig.json
.\node_modules\.bin\vitest.CMD run --pool threads
```

## Current Local Ports

| Service | URL |
| --- | --- |
| API | `http://localhost:3000` |
| Web | `http://localhost:5173` |
| PostgreSQL | `localhost:5432` |

## Stopping Services

Stop the API, worker, and web app with `Ctrl+C` in their terminals.

Stop the Postgres container:

```bash
docker stop hrm-postgres
```

Remove the Postgres container and data:

```bash
docker rm hrm-postgres
```
