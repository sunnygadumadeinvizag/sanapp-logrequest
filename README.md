# IIPE Log Request (sanapp-logrequest)

Independent application #5 of the IIPE intranet — a ServiceNow-style request
tracking app with its **own database** (`app5_db`) and **own roles**.

- **SSO** (sanapp-sso) answers *who are you?*
- **Main** (sanapp-main) answers *can you access this app?*
- **Log Request** answers *what can you do with this request?*

## Features

- **Categories & sub-categories** — Electricity Works, Civil Works, IT Hardware,
  IT Software, IT Network (app-admin configures more).
- **Category eligibility** — the app-admin decides which SSO primary roles
  (staff, students, scholars, guests) may raise requests in each category.
- **POC queues** — each category/sub-category has POCs in a queue order;
  requests are assigned first-come-first-served and wait in the queue when the
  POCs are busy. POCs take requests and can move them to other POCs (with a
  reason).
- **Work tracking** — POCs start/stop a work timer or log time manually; every
  request accumulates total work minutes and the POC sees a full work history.
- **On-behalf requests** — POCs can raise requests for other users.
- **Comments with read/unread** — every participant can mark each comment read
  or unread independently.
- **On-screen notifications** — users are notified in-app (never email) when
  requests are raised, assigned, moved, commented or closed; a sidebar entry and
  header bell show them, and the count updates live.
- **Attachments** — images and PDFs up to 1 MB, stored in the database.
- **Admin console** — full tracking of every request, user and POC workload.

## Routes (base path `/requests`)

| Route | Purpose |
| --- | --- |
| `/` | Dashboard — stats, recent requests, categories |
| `/requests` | My requests (search / status / category filters, pagination) |
| `/requests/new` | Log a request |
| `/requests/[id]` | Request detail — timeline, comments, attachments, work actions |
| `/queue` | POC queue (first come, first served) |
| `/my-work` | POC work history and time spent |
| `/notifications` | On-screen notifications |
| `/admin` | Admin console |
| `/admin/categories` | Categories, sub-categories, eligibility, POC assignment |
| `/admin/tracking` | Full tracking with filters |

## Local development

```bash
cp .env.example .env        # then set DATABASE_URL etc.
pnpm install
npx prisma migrate dev
npx prisma db seed
pnpm dev                    # http://localhost:3006
```

SSO and Main must be running locally on ports 3000/3001 (their dev configs
already register the `iipe-app5` OIDC client and app entry).

## Author

Mr. Sanyasi Naidu Paila — EMPID: NTS1023
