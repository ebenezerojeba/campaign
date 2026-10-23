# APC Lagos Polling Unit Agent Registration: Audit Report

Date: 23 October 2026. Repository: `github.com/ebenezerojeba/campaign` (public), branch `main`. Hosting: Vercel project `apcagent` (https://apcagent.vercel.app).

## 1. Executive summary

The application is a Vite + React single-page site with an Express 5 API, deployed as one Vercel project (static site plus one serverless function) on MongoDB Atlas. It provides polling unit agent registration (with document upload) and a staff administration dashboard.

The audit found one **critical** issue that needs your action. Production's only administrator account still accepts a password that was committed to this public repository. The script has been removed, but **the password must be changed** (section 16).

Other confirmed problems have been fixed:

- Every registration email was failing, because the Resend test sender only delivers to the account owner. The project now uses Nodemailer over SMTP, and the SMTP login has been verified.
- The required bank and identification fields were switched off. They are now required, validated on both sides, and encrypted.
- The registration form applied an invented age-18 rule. It has been removed.
- The mail library had known vulnerabilities. It has been upgraded, and `npm audit` reports 0 vulnerabilities.
- A seeding script could write into production from a developer machine. It now refuses remote databases unless explicitly allowed.

All 44 automated tests and the production build pass.

**Scope note:** the audit brief describes a Next.js site with Keystatic, Cloudinary, contact forms, leadership, news and election-document pages. None of these exist in this repository. There is no Next.js, no Keystatic, no Cloudinary code or dependency, no contact form and no password-reset flow. They are reported as not present, not as working or broken.

## 2. Architecture and stack

| Layer | Implementation |
|---|---|
| Frontend | React 19, Vite 6, Tailwind CSS 4, React Router 7, React Hook Form + Zod (`client/`) |
| API | Express 5 (`server/src/app.js`), Vercel entry `api/index.js`, local entry `server/src/server.js` |
| Validation | Shared Zod schemas used by browser and server (`shared/schemas.js`) |
| Database | MongoDB Atlas via Mongoose 8, cached connection (`server/src/config/db.js`); documents in GridFS bucket `agentDocuments` |
| Email | Nodemailer 10 over SMTP (`server/src/services/email.js`) |
| Auth | Staff-only; bcrypt passwords, JWT in HttpOnly SameSite=Strict cookies, role permissions (`server/src/models/User.js`) |
| Official data | Nigerian states/LGAs and INEC Lagos wards/polling units (`pollingunit/`) |

## 3. Features verified as working

All features below were verified locally against a throwaway database, with email switched off and no production data touched, unless noted otherwise.

- **Registration, start to finish (browser, phone width):**
  - Details, date of birth, agent type, polling unit, identity and bank details, documents, then review and submit. Reference `LAG-Z434-56GZ` was issued.
  - A field-specific message appeared for every invalid or missing value.
  - No horizontal scrolling at 320 px.
  - Identity and bank values, date of birth, documents and consents are never written to the browser's draft storage.
- **Agent type:** exactly Agent 1 and Agent 2, in a required dropdown.
- **Date of birth:**
  - DD/MM/YYYY typing with automatic slashes, plus a device calendar capped at today.
  - Rejects empty, impossible (30/02) and future dates. No age rule.
  - Stored as a MongoDB `Date`.
- **NIN, account number and bank:**
  - NIN must be exactly 11 digits, and the account number exactly 10.
  - The bank must be chosen from the list.
  - Malformed values are rejected, not silently corrected, and are never echoed in error responses.
- **Encryption:** NIN, VIN, party registration number, account name and account number are encrypted in MongoDB (verified by reading the raw documents). A reused NIN or VIN is refused with a generic message.
- **Admin access (administrator):** a masked bank column, masked detail values, and an audit-logged reveal. The CSV export is masked by default, and the full export is separately audit-logged.
- **Admin access (reviewer):** no date of birth, no identity or bank values, and no export. Reveal and export are refused by the server (403), not just hidden in the interface.
- **Email (fake transporter in tests):**
  - The applicant confirmation and the admin alert go to the right recipients. The admin alert carries no contact details.
  - Decision emails work.
  - Recipients that could inject headers are refused, and subjects are flattened to one line.
  - SMTP failures are mapped to safe messages.
- **Real SMTP:** login verified with your Gmail SMTP credentials (`npm run email:check`). No email was sent.
- **Documents:** checked by content, size and pixels, with active content in PDFs rejected. They are served only to signed-in staff with permission.
- **Public API:** status lookup needs both the reference and the phone number, and returns no contact details. The old volunteer endpoints return 404.

## 4. Confirmed bugs (fixed)

| ID | Bug | Evidence | Root cause | Fix |
|---|---|---|---|---|
| B1 | No registration email was delivered | Both production registrations recorded `validation_error: You can only send testing emails to your own email address` for the confirmation and the admin alert | `EMAIL_FROM` was `onboarding@resend.dev`, Resend's test sender | Replaced Resend with Nodemailer over SMTP; production SMTP settings configured |
| B2 | `client/src/services/mailer.js` could never send | Imported nowhere; nodemailer was not installed; browsers cannot open SMTP connections; `process.env` does not exist in browser code | Mail code placed in the browser bundle | Deleted; email lives only on the server |
| B3 | Bank, NIN, VIN and party number fields missing from the live form | `OPTIONAL_FIELDS.financialIdentityDetails: false` | Disabled pending approval, which has now been given | Fields enabled and required, in their own form step |
| B4 | Invented minimum-age rule | Schema rejected under-18 dates; required "I am 18 or older" tick | No official APC Lagos eligibility rule exists | Rule and tick removed; date of birth validated for validity only |
| B5 | Date of birth stored as text | `dateOfBirth: String` | Original optional-field design | Stored as `Date`; earlier text values still display correctly |
| B6 | Five agent categories offered | Form offered Agent 1, Agent 2, Canvasser, Mobilizer, PU Agent | Request was exactly two options | Only Agent 1 and Agent 2 offered; older values stay readable on existing records |
| B7 | VIN collected as "voter registration number" | Field label and name | Different identifiers confused | Renamed to VIN, with guidance not to enter the PU code or card serial |
| B8 | Reviewer detail page silently omitted the identity row | Browser test | Row hidden when the server (correctly) sent no data | Row now says the details are restricted to administrators |
| B9 | Production registrations probably failing since the 00:41 deploy | Deploy `apcagent-g6xinoqjf` (commit `523b157`) required encryption but production had no `DATA_ENCRYPTION_KEY` | In-progress work deployed before configuration | Key set in production; fixed version deployed (section 15) |

## 5. Security findings

| Severity | Finding | Evidence | Status |
|---|---|---|---|
| **Critical** | Hardcoded admin password in the public repository, still valid in production | `server/scripts/create-admin-direct.js` (commit `8753308`). Production's only admin (`their@email.com`) still accepts it (checked read-only with bcrypt). The repository is public. All 6 audit-logged sign-ins came from one address, so there is no evidence of misuse. | Script deleted. **Password change required from you** (section 16). The value remains in git history, so changing it is the real fix. |
| High | Known vulnerabilities in nodemailer 7.0.13 (installed during the migration) | `npm audit`: several advisories, including DoS and TLS issues | Fixed: upgraded to nodemailer 10.2.1; `npm audit` reports 0 vulnerabilities |
| High | Sensitive identity and bank data needed protection once enabled | Requirement | Fixed: AES-256-GCM field encryption, masked views, admin-only reveal and full export (audit-logged), reviewers blocked server-side |
| Medium | Seed script could write sample data into production from a developer machine | Local `.env` points at production Atlas with `NODE_ENV=development`, which bypassed the production guard | Fixed: seeding a non-local database now needs `--allow-remote` (verified refusal) |
| Medium | `DEMO_MODE=true` in production with real registrations | Vercel environment | Fixed: set to `false` |
| Medium | Rate limits are in-memory per serverless instance | `server/src/middleware/index.js` | Open risk: limits apply per warm instance. Use a shared store (for example Upstash Redis) for high traffic. |
| Low | Reviewers can open passport photographs and voter's cards (`documents:read`) | `server/src/models/User.js` | Decision for you: remove `documents:read` from `reviewer` if only administrators may see documents |
| Low | Gmail SMTP limits (~500 messages a day) | Provider limits | Open risk for large registration drives; consider a transactional SMTP provider |
| Info | `db.js` uses `env.mongoUri ?? cache.uri`, but `env.mongoUri` is always a string, so the fallback never applies | Code reading | Harmless; left unchanged |
| Info | An unreferenced commit `7d96b03` exists locally | `git log --all` | Contains only placeholder connection strings; no action |

No other secrets were found in tracked files or history; the connection strings in history are placeholders. `.env` was never committed. The remaining checks found no issues:

- Cookies are HttpOnly, SameSite=Strict, and Secure in production.
- State-changing admin requests need a custom header and a matching origin (CSRF protection).
- All input passes through Zod; `$` and `.` keys are stripped; ObjectIds are validated.
- Helmet secures the API, and a CSP is set on the site.
- Uploads are validated by content.
- Errors never return stack traces or credentials.

## 6. Agent registration audit

| Field | Required | Browser + server validation | Storage | Staff visibility |
|---|---|---|---|---|
| Agent type | Yes | Agent 1 or Agent 2 only | Plain | All staff |
| First, last name (middle optional) | Yes | Letters only, 2–60 | Plain | All staff |
| Date of birth | Yes | Real date, not future, not before 1900; no age rule | `Date` | Administrators |
| Email | Yes | Valid address | Plain, unique | All staff |
| Phone | Yes | Nigerian mobile | Normalised, unique | All staff |
| State and LGA of origin | Yes | Official list; LGA must belong to the state | Plain | All staff |
| LGA, ward, polling unit | Yes | Checked against the INEC dataset on the server | Names from official data | All staff |
| NIN | Yes | Exactly 11 digits | Encrypted, last 4, keyed hash (duplicates refused) | Administrators (masked; reveal logged) |
| VIN | Yes | Letters/digits, 6–30, contains a digit (**official format pending**) | Encrypted, last 4, keyed hash (duplicates refused) | Administrators |
| APC party registration number | Yes | Letters, digits, space, `/`, `-`; 3–40 (**official format pending**) | Encrypted, last 4 | Administrators |
| Bank name | Yes | From the list in `shared/options.js` | Plain | Administrators |
| Account name | Yes | Letters and common name punctuation, 2–100 | Encrypted | Administrators |
| Account number | Yes | Exactly 10 digits | Encrypted, last 4 | Administrators (masked in lists) |
| Passport photograph, PVC | Yes | Content, size and pixel checks | GridFS | Staff with `documents:read` |

Verification status:

- **Not verified with official sources:** no NIMC, INEC, APC or bank verification service is connected. The form, privacy notice and admin page say so, and nothing is labelled as verified.
- **VIN format:** no authoritative INEC specification was found. An older source states 19 characters; current guides do not give a length. So no length is enforced beyond the broad range.
- **Address:** the existing form has no address field (none was in the earlier approved design), and none was added.

## 7. Nodemailer audit

- **Removed:** the `resend` dependency, `RESEND_API_KEY` handling, the Resend client and the `env.resend` settings. `RESEND_API_KEY` was removed from Vercel. No application code references Resend; the only remaining mention is a configuration check that rejects an `@resend.dev` sender.
- **Configuration:** one server-side transporter, created once and reused, reading these settings:
  - `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE` (defaults from the port), `SMTP_USER`, `SMTP_PASS`;
  - `EMAIL_FROM`, which also accepts the legacy `MAIL_FROM`, plus `EMAIL_FROM_NAME`, `EMAIL_REPLY_TO`;
  - `ADMIN_NOTIFICATION_EMAIL`, with `ADMIN_EMAIL` as an alias.
- **Connection:** TLS is required (implicit on 465, STARTTLS otherwise), with connection and socket timeouts.
- **Configuration errors:** missing or invalid settings produce named problems without values, and messages are skipped and recorded rather than crashing. `npm run email:check` validates the settings and logs in without sending.
- **Workflows:** applicant confirmation, admin new-registration alert, and approve/decline decision emails. There is no contact form or password reset in this project. Templates, subjects and recipients are unchanged.
- **Safety:**
  - Single plain recipient addresses only, and one-line subjects, so headers can't be injected.
  - Template values are HTML-escaped.
  - Logs record only SMTP error codes, never credentials, addresses or registration data.
  - Delivery outcomes are stored per registration, and the applicant is told when their confirmation was not sent.
  - Registration is rate-limited (10 per 15 minutes per address).
  - Duplicate submissions are refused before any email is sent.

## 8. MongoDB findings

- The connection string comes from `MONGODB_URI`, and the connection is cached across serverless invocations.
- Unique indexes exist on reference, phone, email, NIN hash and VIN hash (new). The PVC file hash is also checked.
- Invalid IDs return 404; missing records return clear errors; database outages return a safe 503.
- Production contains 2 registrations made before this change. They have no identity or bank details and store the date of birth as text, which still displays correctly. No migration was run, and no production data was modified or deleted. Those two applicants may need to be contacted for the new details.

**Cloudinary:** not used. The dependency was removed when the volunteer opportunities feature was retired, and documents are stored in MongoDB GridFS. There is nothing to audit.

## 9. Build and deployment findings

- The Vercel configuration bundles `pollingunit/**` with the function and has a CSP that allows `blob:` image previews.
- Production environment variable names: `MONGODB_URI`, `JWT_SECRET`, `DATA_ENCRYPTION_KEY`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `EMAIL_FROM`, `ADMIN_NOTIFICATION_EMAIL`, `DEMO_MODE`.
- The project has no lint or type-check tooling: no ESLint configuration, and no TypeScript.
- The brief's `/_not-found`, Next.js image and middleware items do not apply: this is not a Next.js project.

## 10. UI/UX, accessibility and performance

- The new step reuses the existing form components, styling and error pattern. Each field has a label, a hint and an associated error message (`aria-describedby`, `aria-invalid`).
- The date field has a labelled calendar button and numeric keyboard input.
- On mobile, the five-step progress bar uses short labels. There is no horizontal scrolling at 320 px.
- The identity step explains why each detail is collected before asking for it.

## 11. Missing tests and technical debt

- No lint or type checking.
- Browser tests (Puppeteer) live outside the repository and are not in CI.
- In-memory rate limiting (section 5).
- The bank list is static and should be reviewed against the CBN list periodically.
- Bank account name verification is not integrated, because it needs a provider account (for example Paystack account resolution).
- VIN and party registration number rules should be tightened once official formats are supplied.

## 12. Prioritised remediation plan

1. **You:** change the exposed admin password (section 16). Critical.
2. **You:** confirm the purpose wording for bank and identity details in the privacy notice, and have it approved by the data protection lead.
3. **You:** supply the official VIN and APC registration number formats, so their rules can be tightened.
4. Decide whether reviewers should keep access to documents.
5. Consider bank account verification (Paystack or similar) and a shared rate-limit store before large-scale use.

## 13. Affected files

Changed since the audit baseline (`a37df99`):

- **Server:**
  - `server/src/services/email.js`, `server/src/config/env.js`
  - `server/src/controllers/public.controller.js`, `server/src/controllers/admin.controller.js`
  - `server/src/models/Agent.js`, `server/src/routes/index.js`, `server/src/validators/index.js`, `server/src/utils/secure.js`
  - `server/scripts/check-email.js` (new), `server/scripts/create-admin.js`, `server/scripts/seed.js`
  - `server/scripts/create-admin-direct.js` (deleted)
- **Shared:** `shared/schemas.js`, `shared/options.js`, `shared/agentForm.js`
- **Client:**
  - `client/src/pages/Register.jsx`, `client/src/pages/Legal.jsx`
  - `client/src/components/ui/DateField.jsx` (new)
  - `client/src/admin/pages/AgentDetail.jsx`, `client/src/admin/pages/Agents.jsx`, `client/src/admin/pages/Overview.jsx`, `client/src/admin/demoData.js`
  - `client/src/components/layout/PublicLayout.jsx`, `client/src/content/site.js`, `client/index.html`
  - `client/src/services/mailer.js` (deleted)
- **Tests:** `server/test/email.test.js` (new), `server/test/api.test.js`, `server/test/optional-fields.test.js`, `server/test/sensitive-details.test.js`
- **Configuration and documentation:** `package.json`, `package-lock.json`, `.env.example`, `README.md`, `AUDIT_REPORT.md`

## 14. Fixes completed

These are listed in sections 4 and 5. They cover B1 to B9, the nodemailer upgrade, sensitive-field protection, the seed guard and `DEMO_MODE`.

## 15. Test, build and deployment results

| Check | Result |
|---|---|
| `npm test` (API, email, optional-field and sensitive-detail suites) | **Passed: 44 of 44** |
| `npm run build` | **Passed** |
| `npm audit` | **0 vulnerabilities** |
| `npm run email:check` (real SMTP login, nothing sent) | **Passed** with production-style sender settings |
| Lint | Not run: no lint tooling in the project |
| Type check | Not run: JavaScript project, no TypeScript |
| Browser end-to-end (registration, admin, reviewer) | **Passed** locally against a throwaway database |
| Commit, push, production deploy, live checks | See "Deployment results" below |

### Deployment results

| Item | Result |
|---|---|
| Commits | `523b157` (00:41) and `74b5669` (01:20) were committed and pushed by the repository owner during the audit. `74b5669` contains every code change in this report. This report follows in a later commit. |
| Remote | `origin/main` (github.com/ebenezerojeba/campaign). Pushed and in sync; no force-push. |
| Production deployment | `apcagent-hr2b6hvd4` (Vercel, Ready), serving https://www.apclagos.org, https://apclagos.org (redirects to www) and https://apcagent.vercel.app |
| Live `/api/health` | `db: connected`, `email: configured`, `encryption: configured` |
| Live form (browser, phone width, stopped before submit) | **Passed**: all five steps and every validation message, no console errors. No test data was submitted to production. |
| Live routes | `/`, `/register`, `/status`, `/privacy`, `/admin/login` return 200; unknown pages show the app's not-found page; `/api/admin/agents` and `/api/admin/exports/agents` return 401 without a session; unknown API routes return 404 |
| Live email | Production uses the Gmail SMTP account. One test message, sent from the notification mailbox to itself through the app's email code, was **accepted by Gmail** (`sent`). Inbox delivery is for the owner to confirm. |
| Production environment variable names | `MONGODB_URI`, `JWT_SECRET`, `DATA_ENCRYPTION_KEY`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `EMAIL_FROM`, `ADMIN_NOTIFICATION_EMAIL`, `DEMO_MODE` (`RESEND_API_KEY` removed) |

### Hostinger email (notifications@apclagos.org)

| Check | Result |
|---|---|
| Domain on Vercel | `apclagos.org` and `www.apclagos.org` are assigned to project `apcagent` |
| MX | `mx1.hostinger.com`, `mx2.hostinger.com` (correct) |
| SPF | `v=spf1 include:_spf.mail.hostinger.com ~all` (correct) |
| DKIM | `hostingermail-a/b/c._domainkey` are CNAMEs to Hostinger's DKIM hosts (correct) |
| DMARC | `v=DMARC1; p=none` (monitoring only; tighten to `quarantine` once mail is confirmed working) |
| SMTP login, `smtp.hostinger.com` port 465 (SSL) and 587 (STARTTLS) | **Failed: `535 5.7.8 authentication failed`** with the supplied password for `notifications@apclagos.org` |

Hostinger has not been switched on. Production keeps the working Gmail settings until the mailbox login succeeds, so no real emails are lost. To finish the switch:

1. In Hostinger, open **Emails**, then **Email accounts**. Check that `notifications@apclagos.org` exists and is active, and reset its password if needed.
2. Run `npm run email:check` with the Hostinger values to confirm the login.
3. Set `SMTP_HOST=smtp.hostinger.com`, `SMTP_PORT=465`, `SMTP_SECURE=true`, `SMTP_USER=notifications@apclagos.org`, `SMTP_PASS`, `EMAIL_FROM=notifications@apclagos.org` and `EMAIL_FROM_NAME=APC Lagos` in Vercel, then redeploy. No code change is needed.

## 16. Outstanding issues and actions required

1. **Change the exposed admin password now:**
   ```bash
   npm run create-admin -- --email their@email.com --name "Emma" --role admin --public-dns
   ```
   This prompts for a new password (at least 12 characters, hidden as you type), saves it to the database in `MONGODB_URI`, and signs out every existing session for that account. Better still, create an admin with your real email address and deactivate `their@email.com` in **Admin → Staff accounts**.
2. **Local `.env`:** change `EMAIL_FROM` to your Gmail address. It still points at `onboarding@resend.dev`, so local runs skip email. You can also remove `RESEND_API_KEY` and revoke that key in Resend, since it is no longer used. It was also shared in an earlier chat.
3. **Back up `DATA_ENCRYPTION_KEY`:** it was generated for production and appended to your local `.env`. Store a copy somewhere safe. Without it, encrypted NIN, VIN, party numbers and bank details cannot be read.
4. **Official formats:** provide the official VIN and APC registration number formats.
5. **Privacy notice:** approve the privacy notice wording, especially the stated purpose for bank details (paying allowances).
6. **Earlier registrations:** contact the 2 earlier registrants for their identity and bank details, if needed.

## 17. Email delivery investigation (23 October 2026, 05:00 UTC)

**Reported problem:** the site says emails were sent, but recipients do not receive them.

### Root cause

1. **Production does not send from `notifications@apclagos.org`.** Hostinger rejects the supplied credentials for that mailbox, so production still uses the Gmail SMTP account, and messages come from that Gmail address. Evidence:
   - `smtp.hostinger.com` completes the TLS 1.3 handshake with a valid `hostinger.com` certificate.
   - `transporter.verify()` then fails with `535 5.7.8 authentication failed` on port 465 (SSL) and on port 587 (STARTTLS).
   - The production `SMTP_*` variables are still the Gmail values.
2. **Admin alerts are self-sends.** They go from `ayindegeorge20@gmail.com` to `ayindegeorge20@gmail.com`. Gmail files messages an account sends to itself under **Sent / All Mail**, not the Inbox, so the alerts look as if they never arrived.
3. **"Sent" was presented as delivery.** The latest registration (`LAG-36GH-EF2E`, 04:57 UTC) recorded the confirmation, admin alert and decision emails as accepted by Gmail's SMTP server, with `@gmail.com` message IDs. Acceptance is not inbox delivery. The applicant's success page and the admin page used wording that implied delivery.
4. The two earlier registrations failed under Resend before the migration. Those emails were never sent.

### Flow traced

1. The form posts to `POST /api/agents/register`.
2. The record is saved first.
3. `sendRegistrationEmails()` then awaits `transporter.sendMail()` for the applicant confirmation and the admin alert.
4. Each outcome is stored on the registration.
5. The API returns `confirmationEmail`.

The success page shows the green notice only when the status is `sent`, which means SMTP accepted the message. On any other outcome it tells the applicant the email was not sent. Decision emails follow the same path. There is no contact form or password-reset email in this project.

### Fixes

- **`server/src/services/email.js`:** each attempt now gets:
  - a correlation ID, also sent as the `X-Correlation-ID` header;
  - a workflow name;
  - accepted and rejected recipient counts;
  - the SMTP reply (with addresses removed) and the SMTP error code;
  - one structured `[email]` log line containing only the recipient's domain, never addresses, credentials or registration data.
- **Delivery outcomes:** a message counts as accepted only when SMTP accepted at least one recipient and rejected none. `emailConfigNotices()` flags self-addressed admin alerts and Gmail From rewriting.
- **`server/src/models/Agent.js`:** delivery records store `correlationId`, `smtpResponse`, `smtpCode`, `accepted` and `rejected`.
- **`server/scripts/check-email.js`:** prints those notices, and states that a successful login does not prove delivery.
- **Wording:** the applicant now sees "Confirmation email on its way", with a note that the mail server accepted it and a reminder to check spam (`client/src/components/RegistrationSuccess.jsx`). Staff see "accepted by mail server" with the correlation ID and SMTP reply (`client/src/admin/pages/AgentDetail.jsx`).
- **`server/test/email.test.js`:** tests added for correlation IDs and counts, refused recipients counting as failures, authentication-failure logging without secrets, and the self-send warning.

### Results

| Check | Result |
|---|---|
| Hostinger TLS handshake, port 465 | Passed (TLS 1.3) |
| Hostinger `verify()`, ports 465 and 587 | **Failed: 535 authentication failed** |
| Hostinger mailbox existence | Not determinable from here (outbound port 25 is blocked on this network); check in hPanel |
| Gmail `verify()` with production-equivalent settings | Passed |
| Earlier one-off test message to the notification mailbox | Accepted by Gmail. As a self-send it appears under Sent / All Mail. Inbox receipt **not confirmed**. |
| SPF / DKIM / DMARC for apclagos.org | SPF includes Hostinger; DKIM `hostingermail-a/b/c` CNAMEs present; DMARC `p=none` |
| `npm test` | 48 of 48 passed |
| `npm run build` | Passed |
| Live registration email to a test inbox | Not run: it would put fabricated identity and bank data into production. Test it once Hostinger works, with a real test registration you approve, then delete it. |

### Remaining actions

1. **Hostinger mailbox:** in hPanel, open **Emails**, then **Email accounts**. Confirm `notifications@apclagos.org` exists and is active, and reset its password. With the new password, production can be switched to Hostinger (`SMTP_HOST=smtp.hostinger.com`, `SMTP_PORT=465`, `SMTP_SECURE=true`, `SMTP_USER` and `EMAIL_FROM=notifications@apclagos.org`, `EMAIL_FROM_NAME=APC Lagos`). This also ends the admin self-send.
2. **Check Gmail now:** look in **Sent** and **All Mail** of `ayindegeorge20@gmail.com` for the admin alerts and for the test message "APC Lagos registration email test (Nodemailer)". Ask the applicant of `LAG-36GH-EF2E` to check spam.
3. **Hostinger delivery logs:** after switching, use the logs in hPanel to confirm delivery or bounces for any message, by time and recipient domain. Every attempt has a matching correlation ID on the admin page and in the Vercel function logs.
4. **Admin password:** the exposed admin password is **still active**. The owner chose to deploy anyway. Change it (section 16).

### Update: production switched to Hostinger (05:25 UTC)

| Step | Result |
|---|---|
| New mailbox password for `notifications@apclagos.org` | `verify()` **passed** on `smtp.hostinger.com:465` (SSL). The `535` failures were caused by the earlier password. |
| Vercel production and preview | `SMTP_HOST=smtp.hostinger.com`, `SMTP_PORT=465`, `SMTP_SECURE=true`, `SMTP_USER=notifications@apclagos.org`, `SMTP_PASS` (set, not shown), `EMAIL_FROM=notifications@apclagos.org`, `EMAIL_FROM_NAME=APC Lagos`. `ADMIN_NOTIFICATION_EMAIL` unchanged (`ayindegeorge20@gmail.com`), so admin alerts are no longer self-sends. |
| One authorised test to `ayindegeorge20@gmail.com` through the app's email code | **Accepted by Hostinger**: `250 2.0.0 Ok: queued as 4j9s0N0QGbz3y4p`, 1 accepted, 0 rejected, correlation ID `acb66928-895d-4b56-8a2c-df849831cc6b`. Inbox receipt **to be confirmed by the owner**. |
| Production deployment | `apcagent-aia2n18gx` (redeploy of `3824bf8` with the new settings), Ready, serving www.apclagos.org; `/api/health` reports `email: configured` |

Still to do:

- Confirm the test message is in the inbox (or spam) of `ayindegeorge20@gmail.com`. If it is not there, look up queue ID `4j9s0N0QGbz3y4p` in Hostinger's email logs.
- Run one real test registration with an inbox you control, check both emails arrive, then delete the record from the admin page.
- Once mail is confirmed arriving, consider tightening DMARC from `p=none` to `p=quarantine`.
- The local `.env` still holds the Gmail settings. It was deliberately left unedited.

## 18. Official sender, Reply-To and email redesign (23 October 2026, 05:40 UTC)

**Source of the Gmail reply address:** the local `.env` sets `EMAIL_REPLY_TO`, `SMTP_USER`, `MAIL_FROM` and `ADMIN_NOTIFICATION_EMAIL` to the personal Gmail address. Two things put it in front of recipients:

- The Hostinger test messages sent from this workstation loaded that `EMAIL_REPLY_TO`, so they carried `Reply-To: ayindegeorge20@gmail.com`.
- Before 05:25 UTC, production sent *from* the Gmail account, so replies went there too.

Production has no `EMAIL_REPLY_TO` variable.

**Fix (`server/src/services/email.js`):**

- Every message is sent with `from` and `replyTo` both set to `{ name: 'APC Lagos', address: 'notifications@apclagos.org' }`, using Nodemailer's own message properties rather than custom headers.
- `EMAIL_REPLY_TO` is honoured only on the sender's own domain; any other address is ignored, and `npm run email:check` warns about it.
- `sendEmail()` accepts no `from`, `replyTo` or `sender`, so no workflow can override them.
- The SMTP envelope is left to the transport.
- The admin recipient (`ADMIN_NOTIFICATION_EMAIL`) is configured separately and was not changed.

**Design (`server/src/services/emailTemplates.js`):**

- Shared components: header with the APC logo from www.apclagos.org, title, greeting, reference panel, details table, button, note and footer.
- Layout: email-safe tables with inline styles, a 600px maximum width, and a mobile media query.
- Every template has an HTML and a plain-text version. All values are HTML-escaped, and codes use non-breaking hyphens so they stay on one line.
- The footer shows only APC Lagos, the service name, `notifications@apclagos.org`, www.apclagos.org and the reason the recipient is getting the email.

**Templates redesigned:**

| Email | Subject |
|---|---|
| Registration confirmation | `APC Lagos: Registration Confirmation (LAG-…)` |
| Admin new-registration alert | `APC Lagos: New Agent Registration (LAG-…)` |
| Decision, approved | `APC Lagos: Registration Approved (LAG-…)` |
| Decision, declined | `APC Lagos: Registration Update (LAG-…)` |

There is no contact form or password-reset email in this project, so none was added. No email contains NIN, VIN, party registration numbers, bank details or documents.

**Configuration:** `FRONTEND_URL=https://www.apclagos.org` was added to Vercel production, so links and the logo use the official domain.

**Results:**

| Check | Result |
|---|---|
| `npm test` | 54 of 54 passed. New tests cover From and Reply-To on every workflow, no personal address in generated headers or content, rejected overrides, Reply-To domain rules, layout and footer, and HTML escaping. |
| `npm run build` / `npm audit` | Passed / 0 vulnerabilities |
| Rendered templates (Chrome, 800px and 375px) | No horizontal overflow; logo loads; layout consistent |
| Raw generated headers (production settings, with the personal `EMAIL_REPLY_TO` set locally) | `From: APC Lagos <notifications@apclagos.org>` and `Reply-To: APC Lagos <notifications@apclagos.org>`. The Gmail address appears only as the `To` of the admin alert, which is its configured recipient. |
| Real test via Hostinger to the authorised inbox | Accepted: `250 2.0.0 Ok: queued as 4j9sJZ03Drz1xmS`, correlation ID `e3dd183f-282a-405f-b4fb-39f55cea9c95`. Received headers to be confirmed by the owner. |
| Deployment | Commit `3feece0`, deployment `apcagent-hsiokcpkx`, Ready, serving www.apclagos.org; health reports email and encryption configured |

**Manual actions:**

1. In the Gmail inbox `ayindegeorge20@gmail.com`, open "APC Lagos: Registration Confirmation (LAG-TEST-0000) [TEST]", then use **⋮ → Show original**. Confirm that `From` and `Reply-To` read `APC Lagos <notifications@apclagos.org>` and that SPF, DKIM and DMARC show `PASS`.
2. Remove `EMAIL_REPLY_TO` from the local `.env`, or set it to an apclagos.org address. It is ignored now, but should not hold a personal address.
