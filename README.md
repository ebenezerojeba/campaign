# APC Lagos Volunteer Programme

Volunteer registration, a volunteer self-service portal and a staff administration dashboard for the APC Lagos Volunteer Programme.

- **Public site**: landing page, opportunities, a four-step mobile-first registration form, status check by reference + phone.
- **Volunteer portal** (`/portal`): one-time email code sign-in, application status, announcements, opportunities (register interest), profile and communication preferences, data download, correction and deletion requests.
- **Admin** (`/admin`): role-based dashboard with registration trends, LGA and interest summaries, searchable and filterable volunteer list with server-side pagination, approval workflow with confirmation, reasons, internal notes and decision emails, opportunity and announcement management, data-request handling, CSV export, audit log, staff accounts.

## Architecture

```
client/            React 19 + Vite SPA (Tailwind CSS 4, React Router 7, Framer Motion, React Hook Form + Zod, Recharts)
server/src/        Express 5 API (Mongoose 8, JWT in HTTP-only cookies, Helmet, rate limiting, Resend, Cloudinary)
  app.js           Express app (no listen); used by both entries below
  server.js        long-running entry for local dev / VM / container hosting
api/index.js       Vercel serverless entry: exports the same Express app
shared/            Validation schemas, Lagos LGAs/LCDAs and option lists used by BOTH client and server
server/scripts/    seed (sample data), create-admin (staff provisioning)
server/test/       API integration tests (node:test + supertest + in-memory MongoDB)
```

On Vercel, one project serves both: the SPA is static (`dist/`), and every `/api/*` request is rewritten to a single serverless function running the Express app. Same origin means no CORS and `SameSite=Strict` session cookies. The MongoDB connection is cached on `globalThis` so warm invocations reuse it.

### API

| Method | Path | Access |
|---|---|---|
| GET | `/api/health`, `/api/config` | public |
| GET | `/api/stats` | public (aggregate counts only) |
| GET | `/api/opportunities`, `/api/opportunities/:id` | public (published only) |
| POST | `/api/volunteers/register` | public, rate limited |
| POST | `/api/volunteers/status` | public, needs reference **and** phone, rate limited |
| POST | `/api/portal/auth/request-code`, `/api/portal/auth/verify`, `/api/portal/auth/logout` | volunteer sign-in |
| GET/PATCH | `/api/portal/me`, GET `/api/portal/me/export`, `/api/portal/announcements`, `/api/portal/opportunities`, POST `/api/portal/opportunities/:id/interest`, GET/POST `/api/portal/requests` | signed-in volunteer |
| POST | `/api/admin/auth/login`, `/api/admin/auth/logout`; GET `/api/admin/auth/me` | staff |
| GET | `/api/admin/dashboard`, `/api/admin/volunteers`, `/api/admin/volunteers/:id` | admin, reviewer |
| PATCH/POST | `/api/admin/volunteers/:id/status`, `/api/admin/volunteers/:id/notes` | admin, reviewer |
| PUT | `/api/admin/volunteers/:id/assignments` | admin |
| GET | `/api/admin/exports/volunteers` (CSV) | admin |
| GET/POST/PATCH/DELETE | `/api/admin/opportunities[/:id]` (DELETE archives) | read: both; write: admin |
| POST | `/api/admin/uploads/image` | admin (Cloudinary) |
| GET/POST/PATCH | `/api/admin/announcements`, `/api/admin/requests`, `/api/admin/audit`, `/api/admin/staff` | admin |

Responses are `{ ok: true, data, meta? }` or `{ ok: false, error: { code, message, details? } }`. No stack traces are returned.

## Local development

Requirements: Node.js 20+ and npm.

```bash
npm install
cp .env.example .env          # then edit; leave MONGODB_URI empty to use the embedded dev database
npm run dev                   # API on :4000, site on http://localhost:5173 (proxies /api)
```

With `MONGODB_URI` unset, the API starts a local MongoDB 7 binary (via `mongodb-memory-server-core`) with data persisted in `.data/mongo/`. The first start downloads the binary (~600 MB); set `MONGOMS_DOWNLOAD_DIR` to reuse a cached copy.

```bash
npm run create-admin -- --email you@example.org --name "Your Name" --role admin   # prompts for a password (min 12 chars)
npm run seed          # adds 186 clearly-labelled SAMPLE volunteers, 6 opportunities, 2 announcements
npm run seed:reset    # removes every sample record; real registrations are untouched
npm test              # API integration tests
npm run build         # production build to dist/
```

### Sample data rules

Every seeded record has `isSample: true`, sample volunteers use `DEMO-` references and `example.com` addresses, they never receive messages, and the UI marks them **Sample**. Public figures exclude them unless `DEMO_MODE=true`, in which case the site labels the figures **Demonstration data**. The seed script refuses to run against a production environment unless `DEMO_MODE=true` and `--allow-demo` are both given. Use that only on a dedicated demo database, never one with real registrations.

If no database is connected at all, the site says registration is unavailable (nothing is pretended to be saved), and `/admin/preview` offers a read-only dashboard with fictional, labelled fixture data.

## MongoDB Atlas setup

1. Create a cluster (M0 is fine for a demo; M10+ for production, for backups).
2. **Database Access** → add a database user with a strong generated password and the built-in role **readWrite** on a single database only (e.g. `apc_lagos` or `apc_lagos_demo`). Do not use an Atlas admin user.
3. **Network Access** → Vercel functions use dynamic IPs, so Atlas needs `0.0.0.0/0` for Vercel hosting. Compensate with a strong, unique password and least-privilege user. On Atlas M10+, Vercel's Atlas integration or private networking can narrow this.
4. Copy the connection string, put the database name in the path, e.g.
   `mongodb+srv://apc_app:<password>@cluster0.xxxxx.mongodb.net/apc_lagos?retryWrites=true&w=majority`
5. Provision the first admin from your machine against Atlas:
   `MONGODB_URI="<uri>" NODE_ENV=production npm run create-admin -- --email ... --name "..." --role admin`

Indexes (unique reference, unique phone, unique email when present, and query indexes) are created by Mongoose on first connection.

## Deploying to Vercel

The repository is pre-configured (`vercel.json`): framework Vite, install `npm ci`, build `npm run build`, output `dist`, `/api/*` rewritten to `api/index.js`, all other paths fall back to `index.html` so `/register`, `/admin`, `/portal/...` work on refresh.

```bash
npm i -g vercel
vercel login
vercel link                       # create/link the project
vercel env add MONGODB_URI production
vercel env add JWT_SECRET production
vercel env add RESEND_API_KEY production
# ...and the other variables from .env.example as needed
vercel deploy                     # preview
vercel deploy --prod              # production
```

Required in production: `MONGODB_URI` and `JWT_SECRET` (≥ 32 random chars; sign-in is disabled without it). Any Vercel environment (preview or production) is treated as production: secure cookies, no development database. Recommended: `RESEND_API_KEY`, `EMAIL_FROM`, `EMAIL_REPLY_TO`, `ADMIN_NOTIFICATION_EMAIL`, `FRONTEND_URL` (your final domain). Set `DEMO_MODE=true` only for a demo deployment backed by a demo database.

Check after deploying: `https://<domain>/api/health` should report `"db":"connected"`.

### Other hosts

`npm run build && npm start` runs the API and serves `dist/` from one Node process (Render, Railway, Fly.io, a VM). Put it behind HTTPS.

## Email (Resend)

Registration confirmation (to the volunteer, if they gave an email), admin alert (to `ADMIN_NOTIFICATION_EMAIL`), decision emails (approve/decline, optional per decision) and portal sign-in codes. Each has branded HTML and plain-text versions (`server/src/services/emailTemplates.js`).

- The SDK's `error` field is checked; a send is only recorded as `sent` when Resend accepts it.
- Email failure never loses a registration: the record is saved first, and each delivery outcome (`sent` / `failed` / `skipped`, provider id, error) is stored on the volunteer and shown on the admin detail page.
- `onboarding@resend.dev` can only deliver to the email address that owns the Resend account. Verify a domain in Resend and set `EMAIL_FROM` to an address on it before real use.

## Security and privacy

- Passwords hashed with bcrypt (cost 12); accounts lock for 15 minutes after 5 failed sign-ins; there is no public admin sign-up.
- Sessions are JWTs in `HttpOnly`, `Secure` (production), `SameSite=Strict` cookies scoped to `/api`, 8-hour expiry. Sign-out, role changes and deactivation revoke issued tokens (`tokenVersion`).
- CSRF: SameSite=Strict, plus every state-changing authenticated request must carry `X-Requested-With: fetch` and a matching `Origin`.
- Role-based permissions (`server/src/models/User.js`): **admin** (everything) and **reviewer** (read and decide on applications only). Enforced on every route server-side.
- All input is validated with Zod (shared with the browser); request bodies are stripped of `$`/`.` keys; Express 5 uses the simple query parser; ObjectIds are validated.
- Rate limits on registration, login, status lookup and code requests. They are in-memory per instance: on serverless, each warm instance counts separately. For high-traffic production, back `express-rate-limit` with a shared store (e.g. Upstash Redis).
- Helmet on the API; CSP, HSTS, frame denial and other headers on the static site (`vercel.json`).
- CSV export neutralises spreadsheet formula injection, is admin-only and audit-logged.
- Audit log of sign-ins, record views, status changes, notes, exports, opportunity/announcement changes, staff changes and data-request resolutions.
- The form never asks for voter cards, ID documents, bank details, passwords, GPS location, religion, ethnicity or voting intention. Applicants confirm they are 18+, give explicit consent to processing, and separately opt in to communications.
- Public statistics are totals only. No geographic breakdown is published.
- The registration draft is kept in `sessionStorage` (cleared when the tab closes) and never includes consent ticks.

### Data protection (Nigeria Data Protection Act 2023)

- **Privacy notice**: `/privacy` (text in `client/src/pages/Legal.jsx` and `client/src/content/site.js`). Have it reviewed by the programme's data protection lead before launch.
- **Retention policy**: keep records while the person is an active volunteer and for up to 12 months after they leave or are not approved, then delete. Review quarterly: export the list of records older than the retention period, confirm, and delete via data requests or a scheduled job.
- **Subject rights**: volunteers download their data, request correction or deletion from `/portal/privacy`; staff resolve requests in **Admin → Data requests** (completing a deletion permanently deletes the record and keeps a non-personal log entry). Volunteers without email contact the team with their reference.
- **Backups**: use Atlas continuous backup / snapshots (M10+), with at least daily snapshots kept 7–30 days. To restore: Atlas → Backup → choose a snapshot → restore to a new cluster, verify, then point `MONGODB_URI` at it. Ad-hoc: `mongodump --uri "$MONGODB_URI" --out backup-YYYYMMDD` / `mongorestore --uri "$MONGODB_URI" backup-YYYYMMDD`. Store dumps encrypted and delete them per the retention policy.

## Customising content

- Copy, programme areas, steps and FAQ: `client/src/content/site.js`.
- Official logo: put the approved file in `client/public/brand/` and set `site.brand.logoUrl`.
- Approved photography for the hero: add files to `client/public/images/` and list them in `site.heroPhotos`.
- Lagos LGAs and LCDAs, and optional ward lists: `shared/lagos.js` (verify with the programme before launch).
- Interests, skills, availability options: `shared/options.js`.
- Contact details shown in the footer: `PUBLIC_CONTACT_*` environment variables (hidden when empty).

## Troubleshooting

| Symptom | Fix |
|---|---|
| Site says registration is not connected | `MONGODB_URI` is missing in this environment. Set it and redeploy. |
| `/api/health` shows `"db":"unreachable"` | Check the Atlas user/password, the database name in the URI, and Network Access (Vercel needs `0.0.0.0/0`). |
| Staff sign-in says "Sign-in is not configured" | Set `JWT_SECRET` (≥ 32 chars) in production. |
| Sign-in returns "Request blocked" | The request came from another origin. Add it to `CORS_ORIGINS`, or use the same domain for the site and API. |
| Confirmation emails show `failed` with a validation error | With `onboarding@resend.dev` Resend only delivers to your own account email. Verify a domain and update `EMAIL_FROM`. |
| Refreshing `/admin` or `/register` gives 404 on another host | Configure an SPA fallback to `index.html` for non-`/api` paths. |
| `npm run dev` hangs on first start | The embedded MongoDB binary is downloading; or set `MONGODB_URI`. |
