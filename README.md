# APC Lagos Polling Unit Agent Registration

Registration for APC Lagos agents, canvassers, mobilizers and polling unit agents, with document upload and a staff administration dashboard. Live at https://apcagent.vercel.app.

- **Public site**: landing page, a four-step mobile-first registration form (details, role and polling unit, documents, review and consent), and a status check by reference and phone number.
- **Admin** (`/admin`): role-based dashboard with registration trends and LGA and category summaries; a searchable, filterable registration list (category, LGA, ward, polling unit, senatorial district, origin, dates); detail pages with the passport photograph and voter’s card, approval workflow with reasons, notes and decision emails; permanent deletion; CSV export; audit log; staff accounts.

## Architecture

```
client/            React 19 + Vite SPA (Tailwind CSS 4, React Router 7, Framer Motion, React Hook Form + Zod, Recharts)
server/src/        Express 5 API (Mongoose 8, GridFS for documents, JWT in HTTP-only cookies, Helmet, rate limiting, Resend)
  app.js           Express app (no listen); used by both entries below
  server.js        long-running entry for local dev / VM / container hosting
api/index.js       Vercel serverless entry: exports the same Express app
shared/            Validation schemas, form field switches, Nigerian states/LGAs and option lists used by BOTH client and server
pollingunit/       Official data: Nigerian states and LGAs, and INEC wards and polling units for Lagos (see manifest.json)
server/scripts/    seed (sample data), create-admin (staff provisioning)
server/test/       API integration tests (node:test + supertest + in-memory MongoDB)
```

On Vercel, one project serves both: the SPA is static (`dist/`), and every `/api/*` request is rewritten to a single serverless function running the Express app. Same origin means no CORS and `SameSite=Strict` session cookies.

### API

| Method | Path | Access |
|---|---|---|
| GET | `/api/health`, `/api/config` | public |
| GET | `/api/locations/wards`, `/api/locations/polling-units` | public (official INEC lists) |
| POST | `/api/agents/register` (multipart: `data` JSON + `passport`, `pvc` files) | public, rate limited |
| POST | `/api/agents/status` | public, needs reference **and** phone, rate limited |
| POST | `/api/admin/auth/login`, `/api/admin/auth/logout`; GET `/api/admin/auth/me` | staff |
| GET | `/api/admin/dashboard`, `/api/admin/agents`, `/api/admin/agents/:id` | admin, reviewer |
| GET | `/api/admin/agents/:id/documents/:kind` | `documents:read` (admin, reviewer), audit-logged |
| PATCH/POST | `/api/admin/agents/:id/status`, `/api/admin/agents/:id/notes` | admin, reviewer |
| DELETE | `/api/admin/agents/:id` (record and documents) | admin |
| GET | `/api/admin/exports/agents` (CSV, never includes documents) | admin |
| GET/POST/PATCH | `/api/admin/audit`, `/api/admin/staff` | admin |

Responses are `{ ok: true, data, meta? }` or `{ ok: false, error: { code, message, details? } }`. No stack traces are returned.

## The registration form

- **Required**: first and last name (middle name optional), email (validated in the browser and on the server), Nigerian mobile number, state and LGA of origin (from `pollingunit/nigeria-states-lgas.json`), agent category (Agent, Canvasser, Mobilizer, PU Agent), LGA, ward and polling unit (official INEC data), passport photograph and voter’s card.
- **Delimitation**: the INEC polling unit code (e.g. `24-20-01-001`) and senatorial district are filled in from the official data, never typed.
- **Switched off until approved**: date of birth, NIN and selfie. Turn them on in `shared/agentForm.js` only after the data protection lead confirms they are authorised and necessary, and update the privacy notice. NIN also needs `DATA_ENCRYPTION_KEY`; it is stored encrypted (AES-256-GCM), with a keyed hash to catch duplicates, and revealing it is audit-logged. `server/test/optional-fields.test.js` covers this path.
- **LCDA** has been removed, pending confirmation that it is required.

### Document checks

The browser decodes, checks, shrinks and re-saves photos as JPEG (removing metadata such as GPS location) before upload. The server then checks every file by its bytes, not its name or claimed type (`server/src/services/documents.js`):

- format: JPEG, PNG or WebP for photos; JPEG, PNG, WebP or PDF for the voter’s card;
- structure: complete files only (JPEG segments, PNG chunks with CRCs, WebP headers, PDF `%%EOF`);
- size and pixels: passport ≤ 1.5 MB, at least 300 × 300 and portrait or square; voter’s card ≤ 2.5 MB, at least 500 × 300;
- PDFs: no JavaScript, launch actions, embedded files or encryption, including inside compressed streams;
- duplicates: the same voter’s card file cannot be used for two registrations;
- privacy: JPEG EXIF/XMP/IPTC and PNG text chunks are removed before storage.

These checks prove a file is a genuine, usable image or PDF. **They do not prove a voter’s card is authentic**: staff verify cards. The form, privacy notice and admin page all say so.

Files are stored in MongoDB GridFS (bucket `agentDocuments`), never at a public URL, and are served only to signed-in staff with `documents:read`, with `no-store`, `nosniff` and a sandboxing CSP. PDFs download rather than render. Every view is audit-logged. Limits keep a whole registration under Vercel’s 4.5 MB request limit.

## Local development

Requirements: Node.js 20+ and npm.

```bash
npm install
cp .env.example .env          # then edit; leave MONGODB_URI empty to use the embedded dev database
npm run dev                   # API on :4000, site on http://localhost:5173 (proxies /api)
```

With `MONGODB_URI` unset, the API starts a local MongoDB 7 binary (via `mongodb-memory-server-core`) with data persisted in `.data/mongo/`.

```bash
npm run create-admin -- --email you@example.org --name "Your Name" --role admin   # prompts for a password (min 12 chars)
npm run seed          # adds 186 clearly-labelled SAMPLE registrations (no documents)
npm run seed:reset    # removes every sample record; real registrations are untouched
npm test              # API integration tests
npm run build         # production build to dist/
```

Every seeded record has `isSample: true`, a `DEMO-` reference and an `example.com` address, carries no documents and never receives messages. The seed script refuses to run against production unless `DEMO_MODE=true` and `--allow-demo` are both given. With no database connected, the site says registration is unavailable and `/admin/preview` shows a read-only dashboard with fictional, labelled data.

## MongoDB Atlas setup

1. Create a cluster (M10+ for production, for backups and encryption at rest with your own keys if required).
2. **Database Access**: a user with **readWrite** on one database only (e.g. `apc_agents`).
3. **Network Access**: Vercel functions use dynamic IPs, so Atlas needs `0.0.0.0/0`. Compensate with a strong, unique password and least privilege.
4. Connection string with the database name in the path, e.g. `mongodb+srv://apc_app:<password>@cluster0.xxxxx.mongodb.net/apc_agents?retryWrites=true&w=majority`.
5. First admin: `MONGODB_URI="<uri>" NODE_ENV=production npm run create-admin -- --email ... --name "..." --role admin`.

Documents count toward database storage: plan for roughly 0.3–3 MB per registration.

## Deploying to Vercel

The project is `apcagent` (https://apcagent.vercel.app; the old `apc-lagos-volunteers.vercel.app` address still points to it). `vercel.json` configures the Vite build, rewrites `/api/*` to `api/index.js`, bundles `pollingunit/**` with the function, and sets the site’s security headers.

```bash
vercel env add MONGODB_URI production
vercel deploy --prod
```

Required in production: `MONGODB_URI` and `JWT_SECRET` (≥ 32 random chars). Set: `RESEND_API_KEY`, `EMAIL_FROM`, `ADMIN_NOTIFICATION_EMAIL` (new-registration alerts; currently ayindegeorge20@gmail.com). Optional: `EMAIL_REPLY_TO`, `FRONTEND_URL`, `DATA_ENCRYPTION_KEY` (only with NIN on), `PUBLIC_CONTACT_*`. Check `https://apcagent.vercel.app/api/health` reports `"db":"connected"`.

## Email (Resend)

Registration confirmation to the applicant (email is mandatory), a new-registration alert to `ADMIN_NOTIFICATION_EMAIL` (reference, category and polling unit only: no contact details or documents), and approve/decline decision emails. Each outcome is stored on the registration and shown on the admin page; a failed email never loses a registration.

`onboarding@resend.dev` only delivers to the email address that owns the Resend account. Until a domain is verified in Resend and `EMAIL_FROM` uses it, confirmations to applicants will fail.

## Security and privacy

- Passwords hashed with bcrypt (cost 12); accounts lock for 15 minutes after 5 failed sign-ins; no public admin sign-up.
- Sessions are JWTs in `HttpOnly`, `Secure`, `SameSite=Strict` cookies scoped to `/api`, 8-hour expiry, revoked on sign-out, role change or deactivation.
- CSRF: SameSite=Strict plus a required `X-Requested-With: fetch` header and matching `Origin` on state-changing admin requests.
- Permissions (`server/src/models/User.js`): **admin** (everything) and **reviewer** (read, decide and open documents). Remove `documents:read` from a role to stop it opening documents.
- All input validated with Zod on both sides; `$`/`.` keys stripped; uploads parsed in memory with strict limits.
- Rate limits on registration, login and status lookup (in-memory per instance; use a shared store for high traffic).
- Audit log of sign-ins, record and document views, NIN reveals, status changes, notes, exports, deletions and staff changes.
- CSV export neutralises spreadsheet formula injection and never includes documents or NIN.
- The registration draft in `sessionStorage` never includes documents, consents, date of birth or NIN.

### Data protection (Nigeria Data Protection Act 2023)

- **Lawful basis**: explicit consent, with separate ticks for general processing and for storing the photograph and voter’s card, plus an accuracy declaration and 18+ confirmation. The notice version is stored with each consent.
- **Privacy notice**: `/privacy` (`client/src/pages/Legal.jsx`, `client/src/content/site.js`). Must be approved by the data protection lead before launch.
- **Minimisation**: only the listed fields are collected; sensitive optional fields are off by default.
- **Retention**: the election period plus up to 12 months, then delete with **Delete permanently** on the registration page (removes the record and every document; the audit log keeps only the reference).
- **Subject rights**: applicants contact the team with their reference; staff verify identity, then correct or delete.
- **Backups**: Atlas snapshots (M10+). Dumps contain documents: store them encrypted and delete them under the retention policy.

## Customising content

- Copy, requirements, steps and FAQ: `client/src/content/site.js`. Logo: `client/public/brand/apc-logo.jpg`.
- Optional form fields and upload limits: `shared/agentForm.js`. Agent categories: `shared/options.js`.
- Official data: `pollingunit/` (states and LGAs; INEC polling units listed in `manifest.json`). Known gap: the states/LGAs file has 773 LGAs; Bida (Niger State) is missing.

## Troubleshooting

| Symptom | Fix |
|---|---|
| Site says registration is not connected | `MONGODB_URI` is missing in this environment. Set it and redeploy. |
| Uploads fail with “too large” | Files exceed the limits in `shared/agentForm.js`, or a whole request exceeded Vercel’s 4.5 MB. |
| Confirmation emails show `failed` | With `onboarding@resend.dev`, Resend only delivers to the account owner. Verify a domain and update `EMAIL_FROM`. |
| Staff sign-in says "Sign-in is not configured" | Set `JWT_SECRET` (≥ 32 chars). |
| Registration fails with “Secure storage is not configured” | NIN is switched on but `DATA_ENCRYPTION_KEY` is not set. |
