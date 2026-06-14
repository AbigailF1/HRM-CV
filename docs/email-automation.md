# Email Automation

This document describes the HRM applicant email automation implementation.

## Goal

Applicant-related events create durable email jobs. Emails are not sent in the main request flow. The application or status change is saved first, then an email job is queued. A separate worker later claims due jobs and sends them through an email provider abstraction.

## Architecture

The feature is implemented as a PostgreSQL-backed queue.

- Prisma models: `EmailJob`, `EmailLog`
- Prisma enums: `EmailJobStatus`, `EmailEventType`
- Module path: `src/modules/email`
- Worker entrypoint: `src/workers/email.ts`
- Admin routes: `src/modules/email/email.routes.ts`
- HRM integration: `src/modules/jobs/jobs.service.ts`

The current provider is `log`, which records successful sends through Pino. SMTP environment variables are documented and validated when selected, but SMTP delivery is not enabled until a mail transport dependency is intentionally added.

## Database

Migration:

```text
prisma/migrations/20260607120000_email_jobs/migration.sql
```

Tables:

- `email_job`
- `email_log`

Enums:

- `email_job_status`
- `email_event_type`

`email_job` stores:

- event type
- template key
- recipient email and name
- JSON payload
- current status
- attempt count and max attempts
- next retry time
- last error
- provider message id
- dedupe key
- created, updated, and sent timestamps

`email_log` stores audit records for queueing, sending, retry, failure, duplicate suppression, and manual resend actions.

## Event Mapping

Application submission queues this email after the application is saved:

| HRM action | Email event |
| --- | --- |
| Applicant applies | `application_received` |

Admin application status changes queue these emails after the status update is saved:

| New status | Email event |
| --- | --- |
| `screening` | `application_shortlisted` |
| `offer` | `application_offer` |
| `hired` | `application_hired` |
| `rejected` | `application_rejected` |

No email is queued for `interview` yet. The application model has an `interview` status, but it does not have interview date, time, or link fields. Queueing an interview email without those details would produce a weak message, so that path is intentionally skipped until interview scheduling data exists.

## Dedupe

Application event jobs use dedupe keys:

```text
application:<applicationId>:event:<eventType>
```

If a duplicate key is inserted, the repository returns the existing job and writes a `duplicate_suppressed` log entry. This prevents duplicate email jobs for the same application event.

## Templates

Templates live in:

```text
src/modules/email/email.templates.ts
```

Supported template keys match `EmailEventType`:

- `application_received`
- `application_shortlisted`
- `application_offer`
- `application_hired`
- `application_rejected`
- `interview_scheduled`
- `interview_rescheduled`
- `interview_reminder`

Templates support variables such as:

- `{{applicant_name}}`
- `{{applicant_email}}`
- `{{job_title}}`
- `{{company_name}}`
- `{{application_status}}`
- `{{interview_date}}`
- `{{interview_link}}`

Rendering is handled outside controllers. Missing required variables throw `ValidationError` and are treated as permanent failures by the worker.

HTML output escapes rendered variables.

## Worker

Run the worker:

```bash
pnpm worker:email
```

Or directly:

```bash
node --import tsx src/workers/email.ts
```

Worker behavior:

- Polls for jobs with status `pending` or `retrying`.
- Only claims jobs where `next_retry_at` is null or due.
- Uses PostgreSQL `FOR UPDATE SKIP LOCKED` to avoid two workers claiming the same job.
- Marks claimed jobs as `processing`.
- Increments `attempt_count` before sending.
- Sends through the configured provider.
- Marks successful jobs as `sent`.
- Schedules retryable failures.
- Marks permanent failures as `failed`.
- Keeps processing other jobs when one job fails.

Environment controls:

| Variable | Default | Purpose |
| --- | --- | --- |
| `EMAIL_WORKER_BATCH_SIZE` | `10` | Max jobs claimed per poll. |
| `EMAIL_WORKER_POLL_INTERVAL_MS` | `15000` | Delay between polls. |

## Retry Rules

Max attempts: `5`

Backoff:

| Attempt after failure | Next retry |
| --- | --- |
| 1 | 1 minute |
| 2 | 5 minutes |
| 3 | 15 minutes |
| 4 | 1 hour |
| 5 | Permanent failure |

Retryable failures:

- provider errors marked retryable
- unknown runtime errors
- temporary network/provider-style failures when implemented by a real provider

Permanent failures:

- invalid recipient email
- invalid template payload
- missing required template variables
- provider errors marked non-retryable

## Logs

Important actions are stored in `email_log`.

Actions include:

- `job_created`
- `duplicate_suppressed`
- `sending_started`
- `retry_attempted`
- `email_sent`
- `email_failed`
- `retry_scheduled`
- `permanently_failed`
- `manual_resend`

Logs include useful metadata, but must not include API keys, provider secrets, SMTP credentials, cookies, auth headers, or full sensitive payloads.

## Admin Endpoints

All email admin endpoints use `requireAdminSession`.

### Get Email Job

```http
GET /api/v1/admin/email/jobs/:id
```

Example:

```bash
curl "http://localhost:3000/api/v1/admin/email/jobs/<email-job-id>" \
  -H "Origin: http://localhost:3000" \
  -b cookies.txt
```

### Get Email Job Logs

```http
GET /api/v1/admin/email/jobs/:id/logs
```

Example:

```bash
curl "http://localhost:3000/api/v1/admin/email/jobs/<email-job-id>/logs" \
  -H "Origin: http://localhost:3000" \
  -b cookies.txt
```

### Manual Retry

```http
POST /api/v1/admin/email/jobs/:id/retry
```

Example:

```bash
curl -X POST "http://localhost:3000/api/v1/admin/email/jobs/<email-job-id>/retry" \
  -H "Origin: http://localhost:3000" \
  -b cookies.txt
```

### Batch Queue

```http
POST /api/v1/admin/email/batch
```

Example:

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

Each valid recipient creates a separate email job. Invalid recipients are returned in `skipped` and do not prevent valid recipients from being queued.

## Environment Variables

| Variable | Required | Notes |
| --- | --- | --- |
| `EMAIL_PROVIDER` | No | Defaults to `log`. |
| `EMAIL_FROM` | No | Sender address reserved for real transports. Defaults to `no-reply@example.com`. |
| `SMTP_HOST` | Required if `EMAIL_PROVIDER=smtp` | Reserved until SMTP transport is implemented. |
| `SMTP_PORT` | Required if `EMAIL_PROVIDER=smtp` | Reserved until SMTP transport is implemented. |
| `SMTP_USER` | Required if `EMAIL_PROVIDER=smtp` | Must never be logged. |
| `SMTP_PASS` | Required if `EMAIL_PROVIDER=smtp` | Must never be logged. |
| `EMAIL_WORKER_BATCH_SIZE` | No | Worker batch size. |
| `EMAIL_WORKER_POLL_INTERVAL_MS` | No | Worker poll delay. |

## Security Notes

- Email endpoints are admin-only.
- Application emails are queued after successful application data writes.
- Queueing failures are logged and do not fail the main application flow.
- Recipient emails are normalized to lowercase.
- Template variables are validated before job creation.
- HTML template variables are escaped.
- Secrets are not hardcoded.
- Provider credentials are not logged.
- Duplicate event jobs are suppressed by dedupe key.

## Manual QA Flow

1. Start Postgres and apply migrations.
2. Start the API.
3. Start the email worker.
4. Create or sign in as an admin.
5. Create an open job.
6. Submit an application to that job.
7. Confirm an `application_received` row exists in `email_job`.
8. Confirm the worker changes it to `sent`.
9. Confirm `email_log` has `job_created`, `sending_started`, and `email_sent`.
10. Patch application status to `screening`, `offer`, `hired`, or `rejected`.
11. Confirm the matching status email job is queued and processed.

Useful SQL:

```sql
SELECT id, event_type, recipient_email, status, attempt_count, dedupe_key, created_at, sent_at
FROM email_job
ORDER BY created_at DESC;
```

```sql
SELECT email_job_id, action, message, metadata, created_at
FROM email_log
ORDER BY created_at DESC;
```

## Tests

Email-focused tests:

```bash
pnpm vitest run tests/email.service.test.ts tests/email.routes.test.ts tests/jobs.email-automation.test.ts --pool threads
```

Full suite:

```bash
pnpm test
```

The full suite requires a reachable PostgreSQL database at `DATABASE_URL`.

## Known Gaps

- SMTP delivery is not implemented yet; `EMAIL_PROVIDER=log` is the working provider.
- Interview emails are template-ready but not integrated because the app has no interview scheduling fields.
- There is no email job list endpoint yet, only job detail, logs, retry, and batch creation.
