# APC Lagos Polling Unit Agent Registration

Registration for APC Lagos agents, canvassers, mobilizers and polling unit agents, with document upload and a staff administration dashboard. Live at https://apcagent.vercel.app.

- **Public site**: landing page, a four-step mobile-first registration form (details, role and polling unit, documents, review and consent), and a status check by reference and phone number.
- **Admin** (`/admin`): role-based dashboard with registration trends and LGA and agent-type summaries; a searchable, filterable registration list (agent type, LGA, ward, polling unit, senatorial district, origin, dates); detail pages with the passport photograph, voter’s card and masked identity and bank details (administrators can reveal them, audit-logged), approval workflow with reasons, notes and decision emails; permanent deletion; CSV export; audit log; staff accounts.

## Architecture

```
client/            React 19 + Vite SPA (Tailwind CSS 4, React Router 7, Framer Motion, React Hook Form + Zod, Recharts)
server/src/        Express 5 API (Mongoose 8, GridFS for documents, JWT in HTTP-only cookies, Helmet, rate limiting, Nodemailer over SMTP)
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

- **Required**: first and last name (middle name optional), date of birth, email (validated in the browser and on the server), Nigerian mobile number, state and LGA of origin (from `pollingunit/nigeria-states-lgas.json`), agent type (Agent 1 or Agent 2), LGA, ward and polling unit (official INEC data), NIN, VIN, APC party registration number, bank name, account name, account number, passport photograph and voter’s card.
- **Date of birth**: typed as DD/MM/YYYY or picked from the device calendar; must be a real date, not in the future and not before 1900. No age rule is applied, because APC Lagos has not supplied an official eligibility rule. Stored as a MongoDB `Date`.
- **Identification and bank rules**: NIN exactly 11 digits; account number exactly 10 digits; bank chosen from the list in `shared/options.js`. INEC and APC have not published formats that could be verified, so the VIN (letters and digits, 6 to 30 characters) and party registration number (letters, digits, spaces, hyphens or slashes, 3 to 40 characters) get only conservative checks and are labelled “format pending official rules”. Values are trimmed and otherwise kept exactly as typed: malformed input is rejected, never corrected.
- **Not verified**: no NIMC, INEC, APC or bank verification service is connected. The form, privacy notice and admin page say so, and nothing is labelled as verified. Bank account name verification (e.g. Paystack account resolve) needs a provider account and key.
- **Storage**: NIN, VIN, party registration number, account name and account number are encrypted with AES-256-GCM (`DATA_ENCRYPTION_KEY`). Only the last 4 characters are stored in clear for masked display; keyed hashes catch a NIN or VIN already registered. Staff lists and the detail page show masked values; only roles with `agents:sensitive:read` (administrators) see them, can reveal them in full, or export them in full (each audit-logged). Reviewers see none of them, nor the date of birth.
- **Optional**: a selfie remains switched off (`shared/agentForm.js`); `server/test/optional-fields.test.js` covers it.
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

Required in production: `MONGODB_URI`, `JWT_SECRET` (≥ 32 random chars) and `DATA_ENCRYPTION_KEY` (≥ 32 random chars; back it up, and use the same key everywhere that reads the same database). Email: `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `EMAIL_FROM`, `ADMIN_NOTIFICATION_EMAIL`; optional `SMTP_SECURE`, `EMAIL_FROM_NAME`, `EMAIL_REPLY_TO`. Optional: `FRONTEND_URL`, `PUBLIC_CONTACT_*`. Check `https://apcagent.vercel.app/api/health` reports `"db":"connected"`, `"email":"configured"` and `"encryption":"configured"`.

## Email (Nodemailer over SMTP)

All email goes through one server-side transporter in `server/src/services/email.js`, configured from `SMTP_*` environment variables and reused for every message. It sends the registration confirmation to the applicant (email is mandatory), a new-registration alert to `ADMIN_NOTIFICATION_EMAIL` (reference, agent type and polling unit only: no contact, identity or bank details), and approve/decline decision emails. There is no contact form and no password-reset email in this project.

- `npm run email:check` validates the settings and logs in to the SMTP server without sending anything.
- Recipients must be a single plain address: line breaks, display names or lists are refused, and subjects are flattened to one line, so user input cannot inject headers.
- Each delivery outcome is stored on the registration and shown on the admin page. SMTP failures are recorded with a safe message (authentication, connection, recipient refused) that never contains credentials or addresses, and the applicant's success page says when their confirmation was not sent.
- For Gmail, use `smtp.gmail.com`, port 465, an app password, and set `EMAIL_FROM` to the Gmail address itself. Gmail limits sending to roughly 500 messages a day; use a transactional SMTP provider for larger volumes.
- Tests use a fake transporter (`server/test/email.test.js`); nothing is sent.

## Security and privacy

- Passwords hashed with bcrypt (cost 12); accounts lock for 15 minutes after 5 failed sign-ins; no public admin sign-up.
- Sessions are JWTs in `HttpOnly`, `Secure`, `SameSite=Strict` cookies scoped to `/api`, 8-hour expiry, revoked on sign-out, role change or deactivation.
- CSRF: SameSite=Strict plus a required `X-Requested-With: fetch` header and matching `Origin` on state-changing admin requests.
- Permissions (`server/src/models/User.js`): **admin** (everything) and **reviewer** (read, decide and open documents). Remove `documents:read` from a role to stop it opening documents.
- All input validated with Zod on both sides; `$`/`.` keys stripped; uploads parsed in memory with strict limits.
- Rate limits on registration, login and status lookup (in-memory per instance; use a shared store for high traffic).
- Audit log of sign-ins, record and document views, identity and bank detail reveals, status changes, notes, exports, deletions and staff changes.
- CSV export neutralises spreadsheet formula injection, never includes documents, and masks identity and bank values unless an administrator chooses the full export (logged separately).
- The registration draft in `sessionStorage` never includes documents, consents, date of birth, NIN, VIN, party registration number or bank details.

### Data protection (Nigeria Data Protection Act 2023)

- **Lawful basis**: explicit consent, with separate ticks for general processing and for storing the photograph and voter’s card, plus an accuracy declaration and 18+ confirmation. The notice version is stored with each consent.
- **Privacy notice**: `/privacy` (`client/src/pages/Legal.jsx`, `client/src/content/site.js`). Must be approved by the data protection lead before launch.
- **Minimisation**: only the listed fields are collected; sensitive optional fields are off by default.
- **Retention**: the election period plus up to 12 months, then delete with **Delete permanently** on the registration page (removes the record and every document; the audit log keeps only the reference).
- **Subject rights**: applicants contact the team with their reference; staff verify identity, then correct or delete.
- **Backups**: Atlas snapshots (M10+). Dumps contain documents: store them encrypted and delete them under the retention policy.

## Customising content

- Copy, requirements, steps and FAQ: `client/src/content/site.js`. Logo: `client/public/brand/apc-logo.jpg`.
- Optional form fields and upload limits: `shared/agentForm.js`. Agent types and the bank list: `shared/options.js`.
- Official data: `pollingunit/` (states and LGAs; INEC polling units listed in `manifest.json`). Known gap: the states/LGAs file has 773 LGAs; Bida (Niger State) is missing.

## Troubleshooting

| Symptom | Fix |
|---|---|
| Site says registration is not connected | `MONGODB_URI` is missing in this environment. Set it and redeploy. |
| Uploads fail with “too large” | Files exceed the limits in `shared/agentForm.js`, or a whole request exceeded Vercel’s 4.5 MB. |
| Confirmation emails show `failed` or `skipped` | Run `npm run email:check`. It lists missing settings or reports an SMTP login or connection failure. |
| Staff sign-in says "Sign-in is not configured" | Set `JWT_SECRET` (≥ 32 chars). |
| Registration fails with “Secure storage is not configured” | `DATA_ENCRYPTION_KEY` is missing or shorter than 32 characters. |
