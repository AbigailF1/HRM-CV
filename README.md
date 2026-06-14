# HRM API

Express + Prisma API for job publishing, candidate applications, and admin-side application review.

## What's Included

- Better Auth session-based authentication
- Public job listing and job detail endpoints
- Admin job creation, update, and review endpoints
- Resume upload handling for job applications
- PostgreSQL-backed email job queue for applicant email automation
- Protected admin-only resume downloads
- Structured JSON request and error logging with `x-request-id` response headers

## Prerequisites

- Node.js 22+
- pnpm 10+
- PostgreSQL

## Setup

1. Install dependencies:

```bash
pnpm install
```

2. Copy the example environment file and update values:

```bash
cp .env.example .env
```

3. Generate the Prisma client:

```bash
pnpm prisma:generate
```

4. Run database migrations:

```bash
pnpm prisma:migrate
```

5. Start the API:

```bash
pnpm dev
```

6. Start the email worker in another terminal:

```bash
pnpm worker:email
```

The API starts on `http://localhost:3000` by default.

## Environment Variables

| Variable | Required | Example | Notes |
| --- | --- | --- | --- |
| `PORT` | No | `3000` | HTTP port for the Express server. Defaults to `3000`. |
| `DATABASE_URL` | Yes | `postgresql://postgres:postgres@localhost:5432/hrm?schema=public` | Prisma/PostgreSQL connection string. |
| `BETTER_AUTH_URL` | Yes | `http://localhost:3000` | Public base URL used by Better Auth and admin resume download URLs. Must be an absolute URL. |
| `BETTER_AUTH_SECRET` | Yes | `replace-with-a-random-32-byte-secret` | Secret used by Better Auth to sign session data. |
| `BETTER_AUTH_TRUSTED_ORIGINS` | No | `http://localhost:5173,http://localhost:3000` | Comma-separated origins allowed to call Better Auth. In non-production, `http://localhost:5000` is trusted automatically. |
| `UPLOADS_DIR` | No | `uploads` | Root directory for persisted upload files. Defaults to `./uploads`. |
| `RESUME_MAX_FILE_SIZE_BYTES` | No | `5242880` | Maximum allowed resume size in bytes. Defaults to `5 MiB`. |
| `EMAIL_PROVIDER` | No | `log` | Email provider. `log` is enabled for local/dev/tests. `smtp` is reserved until a mail transport dependency is added. |
| `EMAIL_FROM` | No | `no-reply@example.com` | Sender address reserved for real email transports. |
| `SMTP_HOST` | Required if `EMAIL_PROVIDER=smtp` | `smtp.example.com` | SMTP host. Validated only when SMTP is selected. |
| `SMTP_PORT` | Required if `EMAIL_PROVIDER=smtp` | `587` | SMTP port. |
| `SMTP_USER` | Required if `EMAIL_PROVIDER=smtp` | `smtp-user` | SMTP username. Never logged. |
| `SMTP_PASS` | Required if `EMAIL_PROVIDER=smtp` | `smtp-password` | SMTP password. Never logged. |
| `EMAIL_WORKER_BATCH_SIZE` | No | `10` | Max jobs claimed by each worker poll. |
| `EMAIL_WORKER_POLL_INTERVAL_MS` | No | `15000` | Delay between worker polls. |

## Auth Flow

The API uses Better Auth with session cookies.

- Auth endpoints are mounted under `/api/auth/*`
- Admin job and application routes require an authenticated session
- Admin resume downloads require an authenticated session
- Clients such as Postman, Insomnia, or `curl` must preserve cookies between sign-in and follow-up admin requests

Example sign-up:

```bash
curl -X POST http://localhost:3000/api/auth/sign-up/email \
  -H "Content-Type: application/json" \
  -H "Origin: http://localhost:3000" \
  -c cookies.txt \
  -d '{
    "name": "Jobs Admin",
    "email": "admin@example.com",
    "password": "Password123!"
  }'
```

Example sign-in:

```bash
curl -X POST http://localhost:3000/api/auth/sign-in/email \
  -H "Content-Type: application/json" \
  -H "Origin: http://localhost:3000" \
  -c cookies.txt \
  -d '{
    "email": "admin@example.com",
    "password": "Password123!"
  }'
```

## Uploads And Observability

- Resume uploads are stored under `UPLOADS_DIR/resumes`
- Resume files are not publicly served and are only available through authenticated admin routes
- Accepted resume types: `pdf`, `doc`, `docx`
- Request, startup, upload, and error logs are emitted as structured JSON
- Every response includes an `x-request-id` header for tracing and support follow-up
- Sensitive request data such as cookies, auth headers, request bodies, and resume contents are not logged

## Email Automation

Applicant email automation uses durable PostgreSQL jobs, not direct sends in the request path.

- Application submission queues `application_received` after the application is saved.
- Admin status changes queue emails for `screening`, `offer`, `hired`, and `rejected`.
- The `interview` status does not queue an interview email yet because the app has no interview date/time/link fields.
- Each queued job stores its recipient, template key, payload, status, attempt count, retry time, provider message id, and audit logs.
- Duplicate application event jobs are suppressed with a dedupe key like `application:<applicationId>:event:<eventType>`.
- The worker retries temporary failures up to 5 attempts with 1 minute, 5 minute, 15 minute, then 1 hour backoff.

Run the worker:

```bash
pnpm worker:email
```

With the default `EMAIL_PROVIDER=log`, successful sends are logged instead of delivered to a real inbox.

Detailed docs:

- [Email automation runbook](docs/email-automation.md)
- [Local development guide](docs/local-development.md)

## Example API Calls

Health check:

```bash
curl http://localhost:3000/api/v1/health
```

List public jobs:

```bash
curl "http://localhost:3000/api/v1/jobs?page=1&pageSize=20"
```

Get a public job by slug:

```bash
curl http://localhost:3000/api/v1/jobs/backend-engineer
```

Create an admin job:

```bash
curl -X POST http://localhost:3000/api/v1/admin/jobs \
  -H "Content-Type: application/json" \
  -H "Origin: http://localhost:3000" \
  -b cookies.txt \
  -d '{
    "title": "Senior Backend Engineer",
    "slug": "senior-backend-engineer",
    "type": "full_time",
    "status": "draft",
    "questions": [
      {
        "type": "single_select",
        "label": "Primary language",
        "options": [
          { "label": "TypeScript", "value": "typescript" },
          { "label": "Go", "value": "go" }
        ],
        "displayOrder": 1
      }
    ]
  }'
```

Submit a public application with a resume:

```bash
curl -X POST http://localhost:3000/api/v1/jobs/backend-engineer/applications \
  -F "firstName=Ada" \
  -F "lastName=Lovelace" \
  -F "email=ada@example.com" \
  -F "questionResponses=[{\"questionId\":\"11111111-1111-1111-1111-111111111111\",\"value\":\"typescript\"}]" \
  -F "resume=@C:/path/to/resume.pdf;type=application/pdf"
```

List admin applications for a job:

```bash
curl "http://localhost:3000/api/v1/admin/jobs/<job-id>/applications?page=1&pageSize=20" \
  -H "Origin: http://localhost:3000" \
  -b cookies.txt
```

Download a candidate resume from an admin application:

```bash
curl -L "http://localhost:3000/api/v1/admin/applications/<application-id>/resume" \
  -H "Origin: http://localhost:3000" \
  -b cookies.txt \
  -o candidate-resume.pdf
```

Inspect an email job:

```bash
curl "http://localhost:3000/api/v1/admin/email/jobs/<email-job-id>" \
  -H "Origin: http://localhost:3000" \
  -b cookies.txt
```

Inspect an email job's logs:

```bash
curl "http://localhost:3000/api/v1/admin/email/jobs/<email-job-id>/logs" \
  -H "Origin: http://localhost:3000" \
  -b cookies.txt
```

Manually retry an email job:

```bash
curl -X POST "http://localhost:3000/api/v1/admin/email/jobs/<email-job-id>/retry" \
  -H "Origin: http://localhost:3000" \
  -b cookies.txt
```

Queue a batch email:

```bash
curl -X POST http://localhost:3000/api/v1/admin/email/batch \
  -H "Content-Type: application/json" \
  -H "Origin: http://localhost:3000" \
  -b cookies.txt \
  -d '{
    "template_key": "application_received",
    "users": [
      {
        "name": "Alice",
        "email": "alice@example.com",
        "job_title": "Backend Developer"
      },
      {
        "name": "Bob",
        "email": "bob@example.com",
        "job_title": "Designer"
      }
    ]
  }'
```

## Tests

Run the test suite with:

```bash
pnpm test
```

The jobs route tests that touch the database require `DATABASE_URL` to be configured.
