# Feature progress

Phase 0 foundation and ongoing Phase 1A vertical slices. Backlog status is tracked per ID; scaffolding and isolated helpers are not feature completion.

## Dependency remediation and release check (2026-10-20)
- Updated `vitest` to 5.0.5, added explicit `vite` 7.3.7 for the repository's legacy peer-dependency install mode, and overrode PostCSS to patched 8.5.31. `npm ci --ignore-scripts`, `npm test` (92 files / 337 tests), and `npm run lint` pass in this sandbox. `npm audit --omit=dev` reports zero vulnerabilities; full audit reports eight high findings in the Prisma and Next ESLint development/build chains.
- Full local generation/typecheck, PostgreSQL integration, build, and browser E2E are not verified against this updated lockfile: this sandbox cannot reach Prisma's native engine download host and has no Docker/PostgreSQL. The latest successful branch CI (`a318e8e`) passed standard Prisma generation/migrations, typecheck, lint, unit/integration tests, and production build before these dependency updates; it did not run Playwright E2E.
- Do not treat the demo as working or continue feature development until Fedora runs the updated lockfile through Prisma generation, typecheck/build, integration tests and all browser flows. The known 2/4 E2E run still needs trace-backed diagnosis for customer-create and driver-search waits.

## Phase 1A — integration-test database safeguards and Fedora verification (2026-10-20)
- Dedicated integration configuration selects `TMS_TEST_DATABASE_URL` ahead of the normal application URL and rejects non-PostgreSQL, non-loopback, or non-`_test` targets. It also validates a 32-character minimum `AUTH_SECRET` and loopback `APP_URL` before test files load. Bracketed IPv6 loopback is accepted; unsupported protocols are tested as rejections.
- The raw SQL test-migration helper refuses to apply migrations when its current schema already contains relations, preventing accidental reapplication to a previously used database. Fedora/Podman setup and fail-fast commands are documented.
- Owner Fedora run successfully applied all 13 SQL migrations to a `template0`-derived disposable database. The initial integration run exposed two stale fixtures and two invalid lowercase vehicle fixtures; these were corrected. A subsequent run passed 50 tests with one over-specific safety-block trigger-message assertion, which was relaxed to assert rejection rather than wording. Final Fedora verification passes all 13 integration test files and 51 tests (2026-10-20). The focused settings unit suite passes (21 tests); lint and `git diff --check` pass.
- Fedora Playwright E2E was attempted against a fresh, bootstrapped database. After scoping the policy read-only assertion to its status region and disambiguating the maintenance vehicle selector, those two specs pass. The next run passed 2/4 specs; customer-create and driver-search response waiters timed out because their URL predicates were too strict. They now match parsed URL pathnames and query parameters, while asserting response status/data to diagnose any actual service failures. A further Fedora E2E rerun is required; no workflow is marked complete from partial runs.

| Feature ID | Status | Notes |
|---|---|---|
| AUTH-01 | In Progress | Better Auth login/logout, expiring PostgreSQL sessions, DB-backed rate limit, account-active gate and login UI; direct DB integration and HTTP smoke pass. Needs clean CI standard-engine generation/migration verification and remaining workflow hardening. |
| AUTH-02 | Not Started | Invitation, activation, suspension/reactivation UI and services not implemented; invitation delivery and expiry/revocation policy still need owner decision. One-time first-admin method is selected and implemented as a local CLI. |
| AUTH-03 | Not Started | Password reset not implemented; delivery/verification channel requires approval. |
| AUTH-04 | In Progress | Owner-approved role/grant schema, company-scoped authorization resolver, audited role service, bootstrap CLIs, and Super Administrator-only role APIs exist. New searchable user/role-management UI can assign/revoke approved roles for existing accounts; it does not provision or activate users. Page-level tests cover the Super Administrator gate, name/email search, pagination query preservation, and empty-result clearing. Role UI tests and a Super Administrator self-change browser test are added. Domain repository filtering remains. A PostgreSQL-backed role-route integration test and a self-change browser test are added but not run; owner Fedora verification is outstanding. |
| AUTH-05 | In Progress | An authenticated, self-only, read-only profile page displays the signed-in user's name, email, account status, and creation date, with a workspace and password-change path. The browser E2E flow checks profile access and the displayed email (execution remains pending). Profile editing is not implemented; login-history UI is withheld pending approved retention policy. |
| AUTH-06 | In Progress | Two-factor authentication per D-076: auth-library TOTP plugin + backup codes, required for global Super Administrators (gate at sign-in routing + workspace home), optional for all users, plugin-level rate limits. Sandbox-verified 2026-10-21 (plugin-registration test; gate integration test Fedora-pending; PGlite 31/31 migrations); Fedora verification pending. |
| AUD-01 | In Progress | Auth session and role assignment/revocation/initial-bootstrap events are persisted; append-only trigger verified against real PostgreSQL. A Super Administrator-only paginated API and responsive read-only viewer exist; event pagination now supports validated cursor history with previous/next navigation and stale-anchor recovery. Broader event coverage and browser/PostgreSQL route verification remain. |
| SET-01 | In Progress | No-default policy catalogue, required-setting reader, globally authorized write service and Super Administrator settings-status/update API exist; writes are audited transactionally. A new read-only admin status page displays unset/configured state, blocked features and update dates without exposing values. Per-setting role scopes and typed schemas/safe write UI remain for general policy keys; RNT-03 buffers and RNT-04 pricing models/quotation validity plus FIN-01 tax-line structures and RNT-04/RNT-05 deposit policy have dedicated typed validation and audited editors; quote, tax, deposit, and payment calculations/workflows remain inactive. Three disposable-PostgreSQL registry integration tests previously passed on Fedora; a PostgreSQL-backed route test now also checks status-only payload and role denial but is unrun here. E2E checks the response omits policy values and the page has no edit controls, but browser execution remains pending. |
| MIG-01 | In Progress | D-024 approves all-or-nothing CSV batches after row-level preview. Customer, vehicle, and driver imports now have fixed-template parsing/preview, row-level validation, manager-only UI, and transactional audited create. Vehicle registration duplicates are blocked using the existing registration key. D-025 approves warning-only same-name matching within the CSV and existing company records; valid rows remain importable and are always created separately, with no automatic skip/merge/update/deduplication. The warning policy does not alter D-024 all-or-nothing handling of invalid rows. All three success summaries list created records and clear the native file picker after success, avoiding a stale selection that could prompt accidental re-import; component and browser E2E specs assert the reset (browser E2E remains unrun here). The combined unit/route/UI suite passes (45 files, 157 tests); lint passes; Playwright discovers three E2E specs covering role/settings, rental submission, and the combined import, profile, customer, and fleet flow (including the dashboard and document-filter paths); browser execution remains outstanding. Next.js optimized compilation succeeds in the sandbox, but its stale generated Prisma Client prevents a complete local typecheck. Owner Fedora generation surfaced a `RentalRequestDbShape` mismatch (`customerName` is projected from the joined customer relation); the type was corrected in commit `a4158b6`, and owner Fedora `npm run typecheck` now passes after `npm run db:generate`. Browser and PostgreSQL integration verification remain outstanding. |
| CUS-01 | In Progress | D-020 approves required customer/display name, optional manually entered unique reference, and optional free-text type/status with no defaults. Customer schema/migration, manager-scoped audited CRUD/search/archive API, register/edit/history UI, stable cursor pagination with previous/next navigation, search/page context preservation, clear-search action, stale-cursor recovery, schema, component and page tests, and disposable-PostgreSQL integration tests added. Playwright now covers rejection of an invalid customer CSV batch and absence of its reference from the register, valid imports, customer audit-history display, an audited customer edit, and soft-archive removal from the active register; the flow is added but unrun. Limited Dispatcher/Finance/customer projections remain fail-closed pending field rules; generated-client typecheck passed on Fedora after regeneration, while migration, PostgreSQL integration tests, and browser verification remain before acceptance. |
| RNT-01 | In Progress | D-021/D-022/D-023/D-030 approve staff Draft entry, existing-customer link, positive duration minutes, submission prerequisites, and explicit overnight return dates. D-032 adds the limited reasoned review/decline path. Draft create/update/list/detail, return-date migration, submission and approved review/decline transitions, append-only status history, audit and responsive UI are implemented. The request register now supports current-status filtering over the active workflow subset, bounded cursor paging with previous/next navigation, and preserves search/status/page context while opening a request; empty filtered results offer a clear-filters path. The browser rental-request flow now also checks that a declined record can be found using the combined customer search and status filter; browser execution remains outstanding. Later rental, quote, availability and booking workflows remain gated. Dispatcher enquiry-context views remain fail-closed. Verify migrations/client generation, PostgreSQL tests, and browser workflow. |
| RNT-02 | In Progress | D-021/D-023/D-030 approve Draft → Submitted; D-032 also approves Submitted → Under Review → Declined. Ops Manager/Super Administrator actors, reason requirements, DB transition guard, status history and audit are implemented for this subset. Quotation, confirmation, cancellation, dispatch, assignment and completion transitions remain unimplemented or policy-gated. |
| RNT-03 | In Progress | D-027..D-033 define Draft/Submitted as non-reserving, vehicle reservation at Confirmed with a specific vehicle selected, driver reservation at assignment to a Confirmed booking, overnight date handling, the Africa/Accra trip interval boundary, and post-trip buffer semantics. A pure helper computes approved intervals, detects raw overlap, and applies separate configured buffers after the earlier trip; missing/invalid buffers fail closed. It is not wired to resource records or used to claim availability. Operational conflict prevention remains disabled until the authoritative reservation ledger and approved booking transitions are implemented. |
| RNT-04 | In Progress | Typed pricing-model, quotation-validity and tax-line settings are configured only by an audited Super Administrator and remain blank by default. D-038 defines pure deterministic line arithmetic (whole metres/minutes, elapsed 24-hour days, per-line half-up rounding); D-039 resolves requested-duration sources and mismatch handling with a pure helper. Both have tests. D-040 adds pure percentage-tax line arithmetic against a supplied base; D-041 adds an internal, pure pre-tax preview from explicit line/model selections. Neither selects taxability/base/order. An uncached manager-only internal preview is now displayed for Under Review requests, with manually entered distance and D-039 requested duration. D-043 adds an explicit, immutable, reason-audited internal worksheet version for Under Review requests; it is not a customer quotation. Distance sourcing/verification, quote approval, issuance, expiry, acceptance, and customer workflows remain unimplemented; the readiness panel remains informational. |
| RNT-05 | Not Started | No feature implementation; Phase 1+ approval required. |
| RNT-06 | Not Started | No feature implementation; Phase 1+ approval required. |
| RNT-07 | Not Started | No feature implementation; Phase 1+ approval required. |
| RNT-08 | Not Started | No feature implementation; Phase 1+ approval required. |
| RNT-09 | In Progress | Rental customer portal per D-066: audited customer↔login link (`Customer.userId`, link/unlink in the customer editor), own-profile projection, enquiry creation/Draft editing/submission through the shared rental-request cores, customer withdrawal of Draft/Submitted requests (new governed `Cancelled` transitions), explicit no-quotation/no-payment states (migration `20261021130000_rental_customer_portal`). Sandbox-verified 2026-10-21 (unit 390/390; 25/25 migrations on PGlite with guard checks); Fedora verification pending. |
| WEB-01 | Not Started | No feature implementation; Phase 1+ approval required. |
| FLT-01 | In Progress | Vehicle register schema/API/UI supports core factual fields, stable cursor pagination with previous/next navigation, search/page context preservation, clear-search and stale-cursor recovery, a manager-only usual-driver link to an active same-company driver, and a fixed-template all-or-nothing CSV import for new records. Playwright now covers linking an imported active same-company driver to an imported vehicle and verifying it after logout/login; these and broader register/import browser checks remain unrun. Photo storage and document records/files are deferred pending hosting/storage selection. |
| FLT-04 | In Progress | Driver register schema/API/UI supports company-scoped searchable records with only brief-listed details, stable cursor pagination with previous/next navigation, search/page context preservation, clear-search and stale-cursor recovery, full fleet-manager create/edit/archive, and a fixed-template audited CSV import; active drivers can be linked as vehicles' usual drivers by managers with both grants. Playwright now covers linking an imported driver as a vehicle's usual driver; browser verification, dispatcher field-level scope decision, account-to-driver linking, and policy-defined status/availability workflows remain. Dispatcher and Driver OWN_PROFILE listing fail closed until field projection and verified account-link behavior are implemented. D-025 resolves the driver import duplicate warning policy: possible name matches are advisory only; no stable identifier or identity verification is inferred. |
| FLT-02 | Not Started | D-016/D-018/D-019 approve seven status names, no default/manual status control, derived Reserved/Assigned/On Trip, immediate safety blocks, conflict handling, the manager/releaser release rule, and Ops/Fleet Manager/Super Administrator safety-block authority. Drivers/Technicians report defects; Dispatchers view availability only. Transition-specific preconditions and dependent assignment, maintenance, and incident workflows remain unimplemented. |
| FLT-03 | In Progress | Read-only manager vehicle-document date ledger lists manually entered Insurance, Roadworthiness, and Vehicle Registration expiry dates from existing vehicle fields, with vehicle search, category filtering, stable cursor pagination with previous/next navigation, filter preservation, and stale-cursor recovery. D-017 remains binding: no file uploads, expiry classification, automatic reminders, or deletion policy. PostgreSQL/browser verification remains outstanding. |
| FLT-05 | In Progress | Manager-only Fleet overview shows an exact count of non-archived vehicle records and groups them by the user-supplied category, with tenant scope enforced. A PostgreSQL test covers company isolation and archived-record exclusion but remains unrun. It explicitly does not infer availability or classify documents. Availability, assignment, trip, maintenance, upcoming-service, utilisation and downtime metrics await their authoritative workflows and owner-approved rules; PostgreSQL/browser verification remains outstanding. |
| MNT-01 | In Progress | D-044/D-046 implement manager-only non-safety intake and a reason-audited fixed lifecycle with independent approver separation, planned-work/parts fields at approval, explicit completion date/inspection results, and optional explicit pesewa costs. Datetime-local completion and safety-release inputs are interpreted as Africa/Accra wall time independent of the browser timezone. Intake vehicle selection searches all active same-company vehicles by registration, make, or model instead of being limited to the first vehicle-register page. Current status, the latest 50 sequenced events, planned work, completion/inspection evidence and optional pesewa costs are visible to managers; the register supports case-insensitive reference/fault/registration search, status filtering, and stable cursor pagination (100 records per page, with validated same-company anchors and filter-preserving previous/next navigation). A malformed, stale, or foreign-company cursor returns a client error at the API or safely resets the register to its first page. Focused service, API and UI tests cover page bounds, foreign cursors, recovery, navigation history, and preserved filters. A Playwright flow now exercises vehicle safety-block release followed by non-safety maintenance intake and registration search; browser execution remains outstanding. Technician assignment and safety-block linkage remain inactive. |
| MNT-02 | In Progress | D-045 adds atomic, reason-audited application of approved safety blocks, register visibility without reason disclosure, one-time release with completed-work timestamp and passed inspection, and database immutability/one-active-block constraints. The release API returns only block ID, status, and release timestamp. No assignment workflow exists, so assignment prevention is not active. |
| MNT-03 | In Progress | Preventive-maintenance reminders per D-075: per-vehicle service plans (calendar/mileage intervals + last-service baseline), computed reminder register (a passed date never completes maintenance), audited record-service action, deduped fleet-team alerts. Sandbox-verified 2026-10-21 (unit 422/422; PGlite 30/30 migrations); Fedora verification pending. |
| MNT-04 | Not Started | No feature implementation; Phase 1+ approval required. |
| CLI-01 | Tested | Corporate client register implemented (schema, migration, service, API, pages). PostgreSQL integration tests pass 7/7 within the 14-suite/58-test integration run on a disposable `*_test` database (2026-10-20). |
| CLI-02 | Tested | Contract register per D-049 (DB transition guards, row-locked reason-audited transitions, full from-to matrix). Fedora-verified 2026-10-21 in the Phase 1B run at commit 3e32798 (unit 373/373, integration 105/105; log verification-logs/phase1b-20261021011206.log). |
| CLI-03 | Tested | Corporate dashboard per D-059 (ratified at the Phase 1B gate, D-060): audited UserClientBinding, bound-client read model, bound-HR isolation. Fedora-verified 2026-10-21 in the Phase 1B run at commit 3e32798 (unit 373/373, integration 105/105; log verification-logs/phase1b-20261021011206.log). |
| EMP-01 | Tested | Employee register per D-050 with restricted-field handling. Fedora-verified 2026-10-21 in the Phase 1B run at commit 3e32798 (unit 373/373, integration 105/105; log verification-logs/phase1b-20261021011206.log). |
| EMP-02 | Tested | CSV import per D-050/D-024: fixed template, per-client preview, warning-only duplicates, all-or-nothing audited import. Fedora-verified 2026-10-21 in the Phase 1B run at commit 3e32798 (unit 373/373, integration 105/105; log verification-logs/phase1b-20261021011206.log). |
| EMP-03 | Tested | Eligibility toggle via audited update; shift/location text; audited export without restricted fields. Fedora-verified 2026-10-21 in the Phase 1B run at commit 3e32798 (unit 373/373, integration 105/105; log verification-logs/phase1b-20261021011206.log). |
| RTE-01 | Tested | Location register per D-051 (optional coordinate pairs, landmark, Ghana digital address). Fedora-verified 2026-10-21 in the Phase 1B run at commit 3e32798 (unit 373/373, integration 105/105; log verification-logs/phase1b-20261021011206.log). |
| RTE-02 | Tested | Route register with ordered stops and audited stop-order overrides per D-051. Fedora-verified 2026-10-21 in the Phase 1B run at commit 3e32798 (unit 373/373, integration 105/105; log verification-logs/phase1b-20261021011206.log). |
| RTE-03 | Tested | Recurring/one-time schedules with conflict detection, copy, activation toggles per D-051. Fedora-verified 2026-10-21 in the Phase 1B run at commit 3e32798 (unit 373/373, integration 105/105; log verification-logs/phase1b-20261021011206.log). |
| RTE-04 | Tested | Manual planning aid per D-051 (recorded offsets, unmapped-stop flags, capacity check, never labelled optimal). Fedora-verified 2026-10-21 in the Phase 1B run at commit 3e32798 (unit 373/373, integration 105/105; log verification-logs/phase1b-20261021011206.log). |
| RTE-05 | Not Started | No feature implementation; Phase 1+ approval required. |
| BKG-01 | Tested | Booking types and dated-journey records per D-052. Fedora-verified 2026-10-21 in the Phase 1B run at commit 3e32798 (unit 373/373, integration 105/105; log verification-logs/phase1b-20261021011206.log). |
| BKG-02 | Tested | Creation validation per D-052 incl. typed inactive-contract policy and DB-enforced duplicate prevention under parallel requests. Fedora-verified 2026-10-21 in the Phase 1B run at commit 3e32798 (unit 373/373, integration 105/105; log verification-logs/phase1b-20261021011206.log). |
| BKG-03 | Tested | Pending -> Accepted/Rejected/Cancelled staff workflow with sequenced history per D-052. Fedora-verified 2026-10-21 in the Phase 1B run at commit 3e32798 (unit 373/373, integration 105/105; log verification-logs/phase1b-20261021011206.log). |
| BKG-04 | Tested | Cancellations/waiting list/history per D-053. Fedora-verified 2026-10-21 in the Phase 1B run at commit 3e32798 (unit 373/373, integration 105/105; log verification-logs/phase1b-20261021011206.log). |
| BKG-05 | Tested | Booking creation cut-off per D-056; registry row approved at the Phase 1B gate (D-060). Fedora-verified 2026-10-21 in the Phase 1B run at commit 3e32798 (unit 373/373, integration 105/105; log verification-logs/phase1b-20261021011206.log). |
| BKG-06 | Tested | Waiting-list service/API/dispatch panel per D-056. Fedora-verified 2026-10-21 in the Phase 1B run at commit 3e32798 (unit 373/373, integration 105/105; log verification-logs/phase1b-20261021011206.log). |
| TRP-01 | Tested | Trips/manifests with transactional capacity check per D-053 (parallel assignment race covered). Fedora-verified 2026-10-21 in the Phase 1B run at commit 3e32798 (unit 373/373, integration 105/105; log verification-logs/phase1b-20261021011206.log). |
| TRP-02 | Tested | Schedule trip generation, idempotent per (company, schedule, date) per D-053. Fedora-verified 2026-10-21 in the Phase 1B run at commit 3e32798 (unit 373/373, integration 105/105; log verification-logs/phase1b-20261021011206.log). |
| DSP-01 | Tested | Dispatch board read model, no map provider, per D-054. Fedora-verified 2026-10-21 in the Phase 1B run at commit 3e32798 (unit 373/373, integration 105/105; log verification-logs/phase1b-20261021011206.log). |
| DSP-02 | Tested | Resource assignment with override-and-reason; hard blocks not overridable, per D-054. Fedora-verified 2026-10-21 in the Phase 1B run at commit 3e32798 (unit 373/373, integration 105/105; log verification-logs/phase1b-20261021011206.log). |
| DSP-03 | Tested | Boarding-code-adjacent dispatch policies remain fail-closed where unapproved; no-show frees seats per D-054. Fedora-verified 2026-10-21 in the Phase 1B run at commit 3e32798 (unit 373/373, integration 105/105; log verification-logs/phase1b-20261021011206.log). |
| DSP-04 | Tested | Dispatch history/audit surfaces per D-054. Fedora-verified 2026-10-21 in the Phase 1B run at commit 3e32798 (unit 373/373, integration 105/105; log verification-logs/phase1b-20261021011206.log). |
| DRV-01 | Tested | Driver account link (audited, unique userId) per D-055. Fedora-verified 2026-10-21 in the Phase 1B run at commit 3e32798 (unit 373/373, integration 105/105; log verification-logs/phase1b-20261021011206.log). |
| DRV-02 | Tested | Driver own-trips list/detail with linked-driver isolation per D-055. Fedora-verified 2026-10-21 in the Phase 1B run at commit 3e32798 (unit 373/373, integration 105/105; log verification-logs/phase1b-20261021011206.log). |
| DRV-03 | In Progress | Boarding verification per D-073: per-booking 6-digit single-use codes from a secure random source (issued at assignment, passenger-only visibility, end-of-trip-day expiry), typed policy `trips.boarding_code_policy` (unset = DRV-02 tap-to-board), recorded attempts, controlled manual verification with reason, inside the idempotent BOARD event. Sandbox-verified 2026-10-21 (unit 412/412; PGlite 29/29 migrations); Fedora verification pending. |
| DRV-04 | Tested | Idempotent driver event API (replay/conflict) per D-055. Fedora-verified 2026-10-21 in the Phase 1B run at commit 3e32798 (unit 373/373, integration 105/105; log verification-logs/phase1b-20261021011206.log). |
| DRV-05 | In Progress | Driver offline queue per D-074: exactly the eight idempotent driver events queue in `localStorage` on network failure (key generated once per tap), pending-sync panel with sync on load/online/demand, server duplicates clear entries, conflicts/rejections parked with the server's message. Sandbox-verified 2026-10-21 (queue unit tests 6/6; build compiled); Fedora verification pending. |
| PAX-01 | In Progress | Passenger portal per D-065: audited passenger↔employee link (`Employee.userId`, link/unlink in the employee editor), own-profile projection, transport arrangements (active contracts + client routes), journey requests through the shared booking creation core, portal cancellation while Pending/Accepted, passenger-facing journey states, append-only feedback on Completed journeys (migration `20261021120000_passenger_portal`). Sandbox-verified 2026-10-21 (unit 390/390 incl. status-mapper suite; 24/24 migrations on PGlite with guard checks); Fedora verification pending. |
| PAX-02 | Not Started | No feature implementation; Phase 1+ approval required. |
| INC-01 | In Progress | Incident records per D-071: governed `Incident` + sequenced history (DB transition guard, append-only history), driver self-reporting against own active trips, dispatcher in-app alerts, restricted people-affected detail. Sandbox-verified 2026-10-21 (unit 412/412; PGlite 28/28 migrations + guard checks); Fedora verification pending. |
| INC-02 | In Progress | Breakdown response per D-072: eligible replacement suggestions (safety-blocked/busy/expired never offered), audited confirmation on active trips with override discipline, optional safety block + work order via maintenance services, passenger notification. Sandbox-verified 2026-10-21 (unit 412/412; build compiled); Fedora verification pending. |
| FIN-01 | Not Started | No feature implementation; Phase 1+ approval required. |
| FIN-02 | Tested | Corporate invoice generation per D-057/D-058 (DRAFT-only lifecycle confirmed at the Phase 1B gate, D-060); rates registry row approved (D-060). Fedora-verified 2026-10-21 in the Phase 1B run at commit 3e32798 (unit 373/373, integration 105/105; log verification-logs/phase1b-20261021011206.log). Phase 1C extends FIN-02 with the governed lifecycle per D-061, Fedora-verified 2026-10-21 at commit 51bfbd6 (unit 375/375, integration 111/111; log verification-logs/phase1c-20261021132250.log). |
| FIN-03 | Tested | Manual invoice payments per D-062: append-only `InvoicePayment` records against ISSUED invoices, overpayment refused under the invoice row lock, outstanding derived (`total − Σ payments`), automatic PAID at full payment. Fedora-verified 2026-10-21 at commit 51bfbd6 (unit 375/375, integration 111/111 incl. lifecycle 6/6; log verification-logs/phase1c-20261021132250.log). See the Phase 1C section below. |
| FIN-04 | Not Started | No feature implementation; Phase 1+ approval required. |
| FIN-05 | Not Started | No feature implementation; Phase 1+ approval required. |
| FIN-06 | Not Started | No feature implementation; Phase 1+ approval required. |
| FIN-07 | Not Started | No feature implementation; Phase 1+ approval required. |
| FIN-08 | Not Started | No feature implementation; Phase 1+ approval required. |
| NTF-01 | In Progress | In-app notification service per D-068: `Notification`/`NotificationPreference` (migration `20261021140000_notifications`), transactional emitter with per-event dedupe keys and channel preferences, wired to booking created/status-changed/trip-assigned (linked passenger) and rental status changes (linked customer), own-inbox page with unread bell, mark-read/read-all and preference switches. SMS/email channels stored but not yet delivered (NTF-02/03). Sandbox-verified 2026-10-21 (unit 400/400; 26/26 migrations on PGlite); Fedora verification pending. |
| NTF-02 | In Progress | SMS channel per D-069: `SmsProvider` interface with an env-activated Arkesel-shaped adapter (feature is *Not configured* without credentials — nothing is sent or claimed sent), SMS fan-out at emit time to the linked employee/customer telephone (migration `20261021150000_sms_notifications`), explicit Super-Admin/scheduler dispatch with attempts/backoff, and DELIVERED only via the secret-checked delivery-report webhook. Sandbox-verified 2026-10-21 (unit 405/405; 27/27 migrations on PGlite); provider live-verification and Fedora run pending. |
| NTF-03 | In Progress | Email channel per D-070: `EmailProvider` interface with an env-activated SMTP (nodemailer) adapter (honestly *Not configured* without `EMAIL_PROVIDER=smtp` + SMTP settings), email fan-out at emit time to the recipient's login email, explicit Super-Admin dispatch, and `SENT` (handed to the mail server) as the strongest state — never `DELIVERED`. Sandbox-verified 2026-10-21 (unit 409/409; build compiled); Fedora verification pending. |
| RPT-01 | In Progress | D-047/D-048 provide an all-time, manager-only request status/source aggregate plus audited `Draft → Submitted` count. Draft-inclusive scope and unavailable quote, confirmed/completed, financial, utilization and cancellation metrics are explicit; this is not a date-filtered complete RPT-01 report. Focused tests pass; database and browser E2E remain unrun. |
| RPT-02 | In Progress | Staff transport & fleet report per D-064: booking flow from status-history events, no-shows, passengers transported, pickup-delay averages with coverage (on-time rate withheld — threshold unset), route utilisation from Completed trips with capacity+manifest, fleet/document-expiry/maintenance summaries; downtime, fuel/mileage and contract performance declared insufficient-data. Sandbox-verified 2026-10-21; Fedora verification pending. |
| RPT-03 | In Progress | Financial report per D-064: FIN-07 reconciled totals plus windowed revenue by client/service, payments by method, point-in-time outstanding-invoice list; expenses/unit costs/margin insufficient-data. Sandbox-verified 2026-10-21; Fedora verification pending. |
| RPT-04 | In Progress | Shared filters (window ≤366 days, client/route/driver/vehicle/service/status) applied inside permission-scoped report queries; CSV exports serialized from the same scoped results with period/timezone/formula/coverage metadata. `report:export` scope mapping per D-064 (transport: operational scopes; finance: finance scope). Sandbox-verified 2026-10-21; Fedora verification pending. |
| RPT-05 | Not Started | No feature implementation; Phase 1+ approval required. |
| GPS-01 | In Progress | Provider interface + honest Not-configured state per D-077 (no hardware/credentials exist): generic webhook adapter behind a shared secret, authorised-period-only intake, live/stale/simulated classification, restricted append-only history with audited 90-day purge. Sandbox-verified 2026-10-21 (unit 427/427; PGlite 32/32 + trigger checks); Fedora verification pending. |

## Phase 0 evidence (2026-10-18)
- Repository initially contained only the standing brief and phase prompts; no application, DB, or deployment config.
- Added initial scaffold, Phase 0 docs, empty Prisma migration baseline (extension only), CI and `/api/health`.
- Node 22.22.3 and npm 10.9.2 available. Docker command not installed. Hosting target unspecified.
- `npm run typecheck`: pass. `npm run lint`: pass. `npm test`: pass (one health-handler unit test). `npm run build`: pass.
- Started the production server; live `GET /api/health` returned `{"status":"ok","service":"richie-tms"}`.
- Initial `npx prisma generate` attempt failed downloading Prisma native engines; later Phase 1A config enabled Prisma Client generation without Rust binaries. Docker is still unavailable.
- `npm audit`: 13 dependency findings (2 moderate, 9 high, 2 critical); major upgrades are implicated. Must resolve before production.
- Reviewed accessible supplied reference homepages/galleries and selected Navbar, CTA, Scrolltide component and Refero style detail pages; documented concrete patterns and limitations in `REFERENCE_RESEARCH.md`. Gated Mobbin flows/Scrolltide source and unavailable Godly destination are stated honestly. Detailed UI-specific research remains due before UI implementation.


## Phase 1A session record (2026-10-18)

Started the first Phase 1A vertical slice only: authentication foundation (AUTH-01), corresponding audit event persistence (AUD-01), and settings persistence schema (SET-01). Feature code is **in progress, not done**.

- Added Better Auth configuration using PostgreSQL/Prisma adapter, database rate-limit storage, five-per-minute email sign-in limit, disabled public sign-up, minimum 12-character password, eight-hour sessions, and production-secure cookies.
- Added sign-in UI, sign-out control, protected workspace root, account-active session policy, Prisma PostgreSQL driver adapter, auth/audit/settings/tenant schema and initial migration. Auth create/revoke events are logged; SQL trigger rejects update/delete on audit rows.
- Tests: unit health and active-account policy tests pass. Four Better Auth integration tests against real PostgreSQL pass: sign-in/session persistence/get-session/sign-out and audit events; immutable audit-row enforcement; suspended-account session denial; database-backed rate limiting; disabled public registration. The integration test is direct handler-to-PostgreSQL, not Playwright UI automation.
- After the authentication changes, `npm ci`, `npm run typecheck`, `npm run lint`, `npm test` (2 unit tests), `npm run test:integration` (4 real-Postgres tests), and `npm run build` passed. Build used explicitly supplied non-production test environment variables and `force-dynamic` on the protected root.
- Production server HTTP smoke flow against the seeded local PostgreSQL user: `/login` 200; sign-in 200; `get-session` 200 with correct user; protected workspace 200; sign-out 200; subsequent session query returned JSON `null`.
- Resolved: `npx prisma generate` and `npx prisma validate` now pass with Prisma 6.19.3 `engineType = "client"` and the JS schema engine. TypeScript uses generated Prisma model types. An ephemeral, untracked PostgreSQL 15.18 server (with `btree_gist`) was installed via npm and run locally. Both migration SQL files were applied to a fresh test database with the test-only runner; migration DDL and data persistence were exercised against real PostgreSQL.
- Open business choices at this point included the role matrix and first-admin method; both were subsequently resolved on 2026-10-18. Invitation/reset channel and lifecycle, pricing, tax, deposit and cancellation policies remain unset. The one-time bootstrap creates the initial account only; no public registration or invitation flow exists.
- Dependency audit still reports 13 vulnerabilities (2 moderate, 9 high, 2 critical). Resolve before production.
- Remaining validation: `npm run db:migrate:deploy` (Prisma classic/native engine) has not been run because its binary host is blocked here. The JS migration engine attempt failed on PostgreSQL catalog type `name`; it is not the deployment path. CI must run the classic migration on PostgreSQL 16 before this slice can be accepted.
- At the close of this earlier record: verify classic migration in CI and finish AUTH/AUD/SET acceptance criteria. Role matrix and first-admin decisions are now resolved; public registration remains disabled.


## Phase 1A authorization continuation (2026-10-18)

The owner approved the role/permission matrix. The first-admin method is now explicitly selected: one-time local interactive CLI with hidden password entry, refusal when an active Super Administrator already exists, transaction/advisory-lock protection, and an append-only bootstrap audit event; non-TTY invocation was smoke-checked to fail immediately without prompting. Public self-registration remains disabled. See `PERMISSIONS.md`, `OPEN_QUESTIONS.md`, and `SETUP_AND_DEPLOYMENT.md`.

- Added `Role`, `RolePermission`, and company-bound `UserRoleAssignment` persistence with seeded approved role grants, active-assignment uniqueness, non-empty reasons, and a DB check that global Super Administrator assignments have no company while all other assignments do.
- Added deny-by-default scope resolution in `src/modules/auth/permissions.ts`; inactive users are denied, company grants do not cross company IDs, global grants require a global Super Administrator assignment, and own/assigned labels require matching user context. Domain services still must apply the returned data and field restrictions in repository queries. Finance delegated quotation approval is explicitly denied until the policy is defined and enforced.
- Added audited role assignment/revocation service; changes require an active global Super Administrator, self-escalation is blocked, and revoking the final active Super Administrator is blocked. At this record's point, no role UI/API existed; a Super Administrator-only API was added in the continuation below (UI remains absent).
- PostgreSQL integration evidence before the final Prisma engine-config removal: all 7 auth/authorization integration tests passed against an ephemeral PostgreSQL 15.18 database. These tests exercised company boundaries, own-record scope, audited assignment/revocation, sign-in/session/logout, suspended-account denial, DB-backed rate limits and disabled public registration. Since that run, one Finance delegated-approval fail-closed test and a fleet settings grant were added; neither has run against PostgreSQL in the current tree.
- Honored the explicit request to remove Prisma `engineType`: removed the generator setting, conditional engine config and PostgreSQL driver adapter; standard Prisma Client and migration engines are now used. Clean `prisma generate` and `prisma validate` were attempted after this change but both tried to fetch native binaries from `binaries.prisma.sh` and failed due the sandbox network restriction. The current generated files under ignored `node_modules` are from the earlier engine-less configuration, so the passing typecheck/build after removal are not proof of a clean standard-engine generation. CI is configured to regenerate, deploy migrations and run tests against PostgreSQL 16; that result remains a required gate.
- Latest checks after source/config changes: `npm run typecheck`, `npm run lint`, `npm test` (2 unit tests), `npm run build`, and `git diff --check` passed using the existing generated client. The classic/native migration path and current-tree PostgreSQL integration have not been reverified after the Prisma engine change.
- AUTH-01, AUTH-04, AUD-01 and SET-01 remain **In Progress**. AUTH-02/03/05 and other features remain unfinished; no later feature slice was started. Invitation/reset channels, login-history/retention policy, scoped repository filters, role UI, broader audit coverage and audit viewer remain open. `npm audit` still reports 13 findings (2 moderate, 9 high, 2 critical).

## Phase 1A continuation — Super Administrator role API (2026-10-18)

- Added a Super Administrator-only role directory/assignment endpoint and an assignment-revocation endpoint. Actor IDs are derived from the authenticated session; clients cannot submit actor or target overrides. Mutations continue to use the transactional authorization/audit service.
- Added seven unit route tests for unauthenticated access, administrator gating, assignment listing, session-derived actor, denied changes, request spoofing and revocation; all pass. Real PostgreSQL route-level tests remain. Sandbox TypeScript checking is blocked by the ungenerated Prisma Client; the user's Fedora setup generated it successfully.
- User confirmed on Fedora that migrations applied, the first-admin bootstrap completed with hidden password input, and the authenticated workspace rendered. This verifies the local login path, not the unfinished role API or Phase 1A exit criteria.
- The Fedora Compose issue was fixed by using the fully-qualified Docker Hub PostgreSQL image and removing the SELinux-blocked init-file mount; `btree_gist` is created by the baseline migration.
- At this record's point, the role UI, route APIs, audit viewer and settings registry were still outstanding. Later continuations below have added the role APIs, audit viewer and settings foundations; PostgreSQL route-level verification, remaining auth workflows, role/settings UI and all other Phase 1A exit criteria remain. Do not proceed to Phase 1B until all exit criteria pass and are approved.

## Phase 1A continuation — audit API foundation (2026-10-18)

- Added `GET /api/admin/audit-events`, restricted to an active global Super Administrator, cursor-paginated with a fixed 50-event page, and `Cache-Control: private, no-store`. It deliberately excludes IP addresses. At this record's point, this was an API foundation only; the viewer UI was added in the continuation below.
- Added unit tests for authentication/authorization denial, rejection of unsupported filters, pagination bounds/cursor and no-store behavior.
- Latest sandbox checks: lint passes; `npm test` passes 13 unit tests across five test files. Typecheck cannot run here because the sandbox install has no generated Prisma model client; typecheck passed on the user's Fedora machine before this audit route was added, so rerun it there after pulling.

## Phase 1A continuation — audit viewer (2026-10-18)

- Added `/admin/audit`, a read-only server-rendered audit table linked from the workspace only when the signed-in user has the global audit grant. The page rechecks permission on every request, shows 50 newest events per page, localizes times to `Africa/Accra`, excludes IP addresses, and provides a keyboard-scrollable responsive table. It uses only persisted events; no demo rows or guessed business data.
- Added the audit-viewer mapping to `REFERENCE_RESEARCH.md`: the existing responsive static-nav and compact table/token references inform layout, while Mobbin authenticated audit flows remain gated and no claim of workflow inspection is made.
- The audit API and viewer are read-only and Super Administrator-scoped. Audit event retention, broader event coverage and database/browser end-to-end verification remain open; AUD-01 stays In Progress.
- Latest sandbox checks after the viewer change: lint passes; `npm test` passes 13 unit tests. Typecheck and production build still require a generated Prisma Client and must be verified on the user's Fedora setup/CI; no Prisma schema or migration changed in this slice.

## Phase 1A continuation — policy settings registry foundation (2026-10-18)

- Added a typed catalogue of the required policy keys named in the brief (including pricing, distance/time, tax, deposit, quotation/cancellation, shifts, reminder, on-time, inactive-contract booking and boarding-code policies). It stores no defaults and creates no rows.
- Added a company-scoped status reader and a required-value reader. Missing or `configured=false` settings raise a typed error with the dependent feature IDs, so callers can block actions instead of silently substituting a value.
- Added six unit tests for catalogue coverage/no defaults, empty status, malformed/unconfigured blocking and unknown keys. Latest sandbox checks: lint passes and `npm test` passes 19 tests. At this record's point there was no write service; a conservative global-Super-Administrator write service was added in the continuation below. No API/configuration UI or typed per-key policy validator exists yet, and SET-01 remains incomplete.

## Phase 1A continuation — audited setting writes (2026-10-18)

- Added a write service for registered setting keys. Until management defines per-key role scopes, writes require an active global Super Administrator. The service accepts JSON values only, requires a reason, verifies the company exists, and atomically upserts the setting plus a `SETTING_UPDATED` audit event. The audit record stores the setting key/reason, not the value. It creates no default or company record.
- Added unit tests for successful audited write, denial for non-Super Administrators, nonexistent companies, and rejected null/invalid values. At this record's point the settings API and company bootstrap remained open; the owner later confirmed the single-operator tenant and both were implemented in the continuation below. Per-key shape validation, configuration UI and real PostgreSQL transaction tests remain. Settings values stay unset until approved and explicitly entered.

## Phase 1A continuation — company bootstrap and settings API (2026-10-18)

- Owner confirmed a single tenant named Richie Transport Services; corporate customers remain domain records, not separate system tenants. Recorded in D-014 and `OPEN_QUESTIONS.md`.
- Added `npm run bootstrap:company -- --confirm`, which requires an active global Super Administrator email, refuses if any `Company` row exists, creates only the approved company row, and appends an audit event transactionally. It creates no policy or operational records and requires no schema migration.
- Added `GET/PUT /api/admin/companies/{companyId}/settings`. Only an active global Super Administrator can access it. GET returns registered-key status without values; PUT requires explicit JSON value and reason and uses the audited writer. No browser settings UI, per-key role policy or per-key semantic schema is implemented.
- Added API and CLI unit tests. Latest sandbox quality checks: lint passes and `npm test` passes 32 unit tests. A disposable-PostgreSQL integration suite now covers unconfigured reads, audited writes and denial for ordinary users; it has not run in this sandbox. User should run typecheck and integration tests after pulling, using the local generated Prisma Client and a `_test` database.

## PostgreSQL authorization test follow-up (2026-10-18)

- The first user-run integration pass exercised 11 PostgreSQL tests: 10 passed, and one authorization assertion failed because a second assigned role legitimately retained `BILLING_LINK_READ` on `trip:dispatch` after revoking the Driver role. The role-revocation check now asserts denial of the Driver-specific `driver:manage` grant instead. This corrects the test expectation for users with multiple roles; no permission code changed.
- After pulling `0786f44`, the user reran the suite against a fresh disposable PostgreSQL database: **3 test files and all 11 integration tests passed** (4 auth, 4 authorization, 3 settings). Better Auth error/warning log lines were from expected negative-path suspended-account and invalid-password tests. This is the current real-PostgreSQL integration result.
- Sandbox lint and all 32 unit tests pass. Sandbox typecheck currently cannot validate because its local generated Prisma Client is stale/missing model types; it reports implicit-any and missing Prisma exports across existing auth/settings files. The user previously confirmed Fedora typecheck passed at `7c51f21`; the subsequent source change was limited to the integration-test assertion. Clean standard-engine generation remains a CI/environment verification requirement.

## Phase 1A — vehicle register base (FLT-01, in progress; 2026-10-18)

- Studied FleetSimple's publicly visible fleet inventory/editor and driver-overview screenshots before UI work; recorded the mapping and access limits in `docs/REFERENCE_RESEARCH.md`. The screenshots inform inventory filtering and grouped editor fields only; no demo information, AI interactions, or marketing patterns were copied.
- Added a `Vehicle` Prisma model and handwritten migration with company-scoped registration uniqueness, non-empty identity checks, positive optional seats, paired nonnegative odometer plus explicit unit, optional compliance/service dates, notes, and archive timestamp. Registration is normalized to uppercase before persistence. No status default, category list, fuel list, ownership default, odometer unit default, or operational vehicle record was seeded.
- Added tenant-filtered fleet service, API and UI: list/search/cursor, create, replace/update, archive (never hard-delete), audit events, active-company guard, and dispatcher-limited read projection; mutation requires full GLOBAL/COMPANY fleet scope. The responsive `/fleet/vehicles` page links from the authenticated workspace when `fleet:manage` is granted.
- Added unit tests for validation and API authentication/session-derived actor, plus real-PostgreSQL integration tests for normalization, tenant scoping, unique registration, permission projections/denials, audited create/update/archive, and archive retention. The user applied all three migrations to a fresh disposable `_test` DB; all 14 integration tests passed across auth, authorization, settings and fleet files. No Better Auth warning indicates suite failure; the invalid-password/suspended-account logs are expected negative-path coverage.
- The user confirmed Fedora `npm run db:generate`, `npm run typecheck`, `npm run lint`, and `npm test` all pass on `2a06978` (38 unit tests). Sandbox lint, unit tests and diff check pass; sandbox typecheck/build remain unverified because its Prisma Client is stale and cannot be regenerated here. No build success is claimed.
- FLT-01 stays In Progress: vehicle photo/document file storage, document records, usual-driver relation and browser end-to-end verification remain. FLT-02/03/04/05 are not started. MIG-01 later began with a customer-only import slice; vehicle/driver CSV imports remain outstanding. The additive vehicle migration's application-database and browser verification status is tracked in the later FLT-01 record.

## Opt-in development demo fixture (2026-10-18)

- In response to the owner's request for a synthetic local vehicle test record, added `npm run seed:demo:vehicle -- --confirm-demo`. It creates one reserved `DEMO-GH-001` record only when `NODE_ENV=development`, `APP_URL` and PostgreSQL `DATABASE_URL` are local, the database name is not production-like, and exactly one active company exists. It is idempotent, refuses to overwrite a non-demo vehicle, clearly labels the category/notes, and writes an audit event.
- This is an explicit CLI, not automatic app-startup or migration seeding; production demo data remains prohibited. Six environment-guard unit cases pass as part of 44 unit tests; lint passes, and a production-mode CLI refusal smoke test passed. The command itself has not yet been run against the owner's local database.
- The sandbox typecheck still uses a stale Prisma Client and reports implicit-any/missing Prisma type errors across the existing app and the new transaction callback. The owner previously confirmed `db:generate` and typecheck pass on `2a06978`; rerun generation/typecheck after pulling this script change.

## Vehicle register browser/build check (2026-10-18)

- Owner screenshot confirms `/fleet/vehicles` renders and shows the clearly labelled `DEMO-GH-001` record. This verifies display, not edit/archive or persistence across an application restart.
- Owner ran `npm run build` successfully on `8ba8a73`; Next compiled and typechecked. It emitted two Autoprefixer warnings for `align-items: end` (audit heading and fleet title row). Both CSS declarations have been changed to `flex-end` in the current patch; rebuild after pulling to confirm warning-free output. The owner has not yet reported an edit/save test.

## Login credential URL leak hardening (2026-10-18)

- Owner screenshot showed the login page in an unstyled, non-hydrated state and credential parameters in the address bar. Treat the password as compromised; it must be rotated anywhere reused. No credential value is copied into source or docs.
- Changed the login form's native fallback to `method=post`, added a server redirect that strips email/password query parameters, and set a global `Referrer-Policy: no-referrer` header. Added `/account/security` with an authenticated Better Auth password-change form that revokes other sessions; a future sign-in now has a route to rotate the exposed credential.
- Added a PostgreSQL auth integration case for password change, old-password rejection, new-password sign-in, and revocation of other sessions. The owner ran it on a fresh disposable `_test` database: all **15 integration tests passed** across auth, authorization, fleet and settings; the Better Auth invalid-password warnings are expected negative-path checks.
- Owner pulled `c20bbec` and confirmed Fedora `npm run typecheck`, `npm run lint`, `npm test` (44 unit tests), and `npm run build` all pass; the build has no warnings and includes `/account/security`. Browser use of the password-change form and rotation of the exposed password have not yet been confirmed.
- Likely cause of unstyled page is the dev server being left running while `next build` replaced shared `.next` output; restart dev after build. This is a diagnosis, not yet confirmed on the user's machine.

## Phase 1A — driver register base (FLT-04, in progress; 2026-10-18)

- Added the `Driver` company-scoped schema and handwritten additive migration. The model contains only the driver register data named in the brief plus the driver's name for record identity; status and availability are optional free text with no preloaded values. No contact details, notes or account link are collected; no development/demo driver is seeded. PostgreSQL integration tests use explicitly synthetic records in the disposable `_test` database only.
- Added searchable, cursor-paginated company driver list/detail/create/update/archive service and authenticated API. Create/update/archive are transactional with audit events; archived rows are retained. Writes and reads currently require full GLOBAL/COMPANY scope. Dispatcher `READ_ASSIGN_SUBSET` and Driver `OWN_PROFILE` are denied at this boundary until their field projection and account-link rules can be applied safely; no broad driver collection is exposed to an own-profile-only user.
- Added responsive `/fleet/drivers` UI with a searchable list and manager form for only brief-listed fields. Status/availability are blank unless entered and explicitly described as company-agreed free text. Driver links are restricted to manager scopes. FleetSimple's publicly visible driver overview plus Navbar Gallery/Refero table and navigation guidance informed the page; mapping and limitations are in `REFERENCE_RESEARCH.md`.
- Updated `OPEN_QUESTIONS.md` with unresolved driver status/availability transitions, dispatcher field scope, driver-account identity/linking, and personal-data/retention decisions. Usual-driver relationship to vehicles remains unimplemented; FLT-01 is still in progress.
- Sandbox lint, `git diff --check`, and all 49 unit tests pass. The PostgreSQL driver integration suite and browser create/edit/archive flow have not been run. Sandbox `npm run typecheck` remains blocked by stale generated Prisma model types (including transaction callback implicit-any errors across existing modules); native Prisma engine download is blocked here. The user should run Prisma generation, typecheck, migration deployment, the disposable `_test` integration suite, and browser verification on Fedora before treating this slice as accepted.

## Owner Fedora verification — driver register pull (2026-10-18)

- Owner pulled `5d8e3a1`, generated Prisma Client 6.19.3, and applied `20261018193000_driver_register` to the local `richie_tms` PostgreSQL database successfully. This was the local application database migration, not the disposable integration-test database.
- Owner-confirmed `npm run typecheck`, `npm run lint`, and `npm test` all pass; unit suite is **49/49**. The dev server compiled `/fleet/drivers` and returned HTTP 200 after authentication.
- This verifies migration application, generated-client typechecking and page rendering on Fedora. PostgreSQL integration tests and browser create/edit/archive verification are still outstanding. The `npm ci` output reported the existing **13 dependency audit findings** (2 moderate, 9 high, 2 critical); no forced dependency upgrades were run.

## Phase 1A — usual-driver link (FLT-01/FLT-04, in progress; 2026-10-18)

- Added an optional `Vehicle.usualDriver` relation constrained to the same company by a composite driver foreign key plus a tenant-key equality check. Existing vehicles migrate with no linked driver; no default or fixture is introduced.
- Fleet managers with both `fleet:manage` and `driver:manage` may search active driver records and link/clear the usual driver in the vehicle editor. Vehicle list/detail projections include driver identity only for that same manager scope; dispatcher projections omit both the driver ID and name. API changes recheck the active same-company driver; the database composite FK blocks cross-company links even on direct writes.
- Existing links to an archived driver are visible to managers as archived and can be preserved or cleared; new links to archived drivers are rejected. This is master-data linkage only, not operational trip assignment or availability/safety logic.
- Added migration `20261018200000_vehicle_usual_driver`, schema/API validation and integration coverage for same-company links, cross-company denial/database constraints, clearing links and dispatcher projection. Sandbox lint and 51 unit tests pass. The new migration, PostgreSQL integration case, regenerated-client typecheck and browser link flow have not yet been run; sandbox Prisma generation/typecheck remain blocked by unavailable engine binaries/stale generated model types.

## Owner Fedora verification — usual-driver migration (2026-10-18)

- Owner pulled `23be783`, regenerated Prisma Client 6.19.3, and applied `20261018200000_vehicle_usual_driver` to the local `richie_tms` PostgreSQL database successfully.
- Owner-confirmed `npm run typecheck`, `npm run lint`, and `npm test` all pass; unit suite is **51/51**. This verifies schema/client generation and migration deployment on Fedora.
- The PostgreSQL integration tests for same-company linkage/database constraints and the browser link/clear flow have not yet been reported; FLT-01/FLT-04 remain In Progress pending those checks and existing vehicle edit/save verification.

## Vehicle create-form reset follow-up (2026-10-18)

- Fixed the vehicle-create success path to retain the form element reference across the asynchronous save before resetting it. Also remounts the controlled usual-driver picker after a successful create so the visible selection and hidden submitted driver ID both clear with the rest of the form.
- Added a jsdom component test that chooses a driver, verifies its ID is submitted, and checks that the text form fields, picker display and hidden driver ID all clear after a successful response. `npm test` passes (52/52), `npm run lint` and `git diff --check` pass. Sandbox `npm run typecheck` remains blocked by stale generated Prisma Client types (implicit-any Prisma callbacks and missing generated Prisma exports in unrelated modules); the new test adds no reported type errors. This is component-level coverage, not a real browser/backend test; local browser verification remains outstanding.

## Owner decision — vehicle status safety boundary (D-016; 2026-10-18)

- Owner approved the recommendation: retain the seven vehicle status names from the brief; no default status and no manual status control in the current register; Reserved/Assigned/On Trip are to derive from authoritative reservation/assignment/trip records; Under Maintenance/Out of Service/Pending Inspection block assignments and may return to Available only after the required maintenance/inspection workflow is complete. The unrequested `Retired` status is excluded.
- Recorded in `docs/DECISIONS.md`, `docs/STATE_MACHINES.md`, and `docs/OPEN_QUESTIONS.md`. FLT-02 remains Not Started because exact transition actors/preconditions, active-assignment handling, and release authority remain open. Do not code a state transition UI or assign status defaults until these dependent rules exist.

## Owner decision — vehicle document scope and storage boundary (D-017; 2026-10-18)

- Owner approved deferring photo/document uploads until a production hosting/storage provider is selected. Initial document categories are limited to Insurance, Roadworthiness, and Vehicle Registration.
- Existing expiry dates remain manually entered/viewed. No automatic reminders or automatic file deletion will be implemented until lead times, recipients/channel, and retention periods are approved. No file records, storage provider, or fixture were added by this decision; service/maintenance records remain separate.
- Recorded in `docs/DECISIONS.md` and `docs/OPEN_QUESTIONS.md`. FLT-01/FLT-03 remain In Progress/Not Started as shown in the feature table until the relevant workflows can be safely implemented.

## Owner decision — vehicle safety-block conflicts and release authority (D-018; 2026-10-18)

- Owner approved immediate safety blocking with no new assignments; future assignments are flagged for dispatcher resolution and are not silently cancelled/reassigned; an active trip uses the incident/replacement workflow.
- A Fleet Manager/authorized releaser can return a vehicle to Available after work completion and an inspection record; a separate inspector role is not required.
- Recorded in `docs/DECISIONS.md`, `docs/STATE_MACHINES.md`, and `docs/OPEN_QUESTIONS.md`. FLT-02 remains unimplemented: entry actors and transition-specific preconditions remain open, and the dependent assignment/maintenance/incident workflows do not yet exist. No manual status UI/default was added.

## Phase 1A — customer register base (CUS-01; 2026-10-19)

- Owner approved D-020 before implementation: required customer/display name; optional manually entered company-unique reference; optional free-text type/status with no preset values or defaults; brief-listed contact, telephone, email, billing details and notes. No generated reference format, status transitions, or business vocabularies were invented.
- Added tenant-scoped `Customer` schema and additive migration with optional reference uniqueness, non-empty name constraint, soft archive, and grants from the owner-approved customer permission matrix. Customer and change reasons are audited without copying customer fields into event summaries; per-customer history presents action, time, actor and reason.
- Added manager-scope-only (Super Administrator/Ops Manager) customer search/list/detail/create/update/archive service and company API, responsive register/form, and home navigation. Enquiry-context, Finance billing-context and rental-customer own-profile permissions currently fail closed because their field-level projections are not specified/implemented. No customer-to-rental workflow is included.
- Added schema and disposable-PostgreSQL integration coverage for empty policy values, validation, tenant scoping, optional reference uniqueness, audit history, update and soft archive. Design uses the already-inspected compact Refero/FleetSimple register patterns and responsive static navigation; the source-to-feature mapping is in `REFERENCE_RESEARCH.md`.
- Verification status: sandbox `npm test` passes (58/58), `npm run lint` and `git diff --check` pass. Prisma validate/typecheck cannot complete here because required Prisma binaries are unreachable and the sandbox-generated Client is stale; no generated-client or database migration result is claimed. Still run generation, migration on a fresh disposable `_test` DB and local development DB, PostgreSQL integration tests, and browser create/edit/search/archive/history checks before acceptance.

## Phase 1A — staff rental Draft entry (RNT-01 base; 2026-10-19)

- Owner approved D-021/D-022/D-023 before implementation: staff enquiries are saved as Draft, submission is separate, Draft may omit both return time and duration, submission requires at least one, a request links to an existing customer, and duration is positive whole minutes. Submission also requires service date, departure time, pickup, destination, positive passenger count and source; only Ops Managers and Super Administrators may submit. No later status transition is implemented.
- Added company/customer-constrained `RentalRequest` schema and additive migration, preserving service date and local time values without timezone conversion. Draft status is the only allowed initial state; the single approved Draft → Submitted transition requires a status-history row and is audited transactionally. History rows are append-only at the database level. Draft updates cannot change status and only affect records still in Draft.
- Added Ops Manager/Super Administrator search, detail, create, Draft-update and submit services/API/UI, plus customer search picker. Submission validates the D-023 fields atomically and returns the missing-field list. Limited Dispatcher enquiry-context request views remain fail-closed pending field projections. Later quote, availability, reservation, cancellation, dispatch and vehicle/driver assignment workflows are not included.
- Unit schema and jsdom component tests cover incomplete Draft entry, customer selection, submission UI, date/time/source validation, approved submission preconditions and ensuring no vehicle/status is submitted; API route tests cover authentication/actor derivation and missing-field responses. Disposable-PostgreSQL integration tests cover tenant/customer boundaries, authorized actors, audit, Draft-only checks, transition/history integrity and immutable history. `npm test` passes (71/71), including a route-level 403 test for a non-authorized session, `npm run lint` and `git diff --check` pass. Sandbox `npm run typecheck` remains blocked by stale generated Prisma Client errors in pre-existing auth/fleet/settings modules; no rental/customer module type errors are reported. Prisma validation/migration and PostgreSQL integration remain pending because the sandbox cannot fetch Prisma binaries and has no configured disposable database. `npm run build` compiles the app but fails at Next.js type validation on the same stale generated-client/unrelated TypeScript errors as `npm run typecheck`; no production build success is claimed. Added a guarded, local-only Playwright scenario and setup instructions; its test discovery passes, but it has not been launched in a browser.

- After excluding `e2e/**` from Vitest, the full unit suite passes: 19 files, 71 tests, including direct tests of every D-023 missing-field requirement and the return-time/duration alternative plus the submission API denial response. `npm run lint` and `git diff --check` pass. `npm run test:e2e -- --list` discovers the single rental submission scenario; this validates discovery only, not browser execution. The Playwright config requires local test DB/auth/login environment values and starts its own fresh dev server. Updated the rental UI copy to distinguish the implemented Draft → Submitted action from the unapproved review/quotation/availability workflows; CTA now says “Submit request,” with accessible focus/disabled styling.

## Phase 1A — customer CSV import vertical slice (MIG-01; 2026-10-19)

- Owner approved D-024: imports are all-or-nothing after preview; no records are written while any file/row error exists, no rows are silently dropped, and existing records are never merged or updated.
- Added a customer-only import page, downloadable fixed-header template, CSV preview/row validation and explicit full-batch import. Uses only D-020 customer fields; blank optional fields stay unset. Duplicate references in-file or within the company are row errors; customer names are not treated as unique. Each row is created and audited in the same database transaction. Vehicle and driver imports remain unimplemented.
- Technical safeguards: UTF-8 CSV syntax checks, every parsed row retained (including blank rows as invalid), 2 MB and 1,000-row batch limits, strict known headers, reason recorded in each customer's audit event, tenant/role checks on preview and import, no-store responses. Templates and validation guidance are mapped to inspected Odoo import documentation in `REFERENCE_RESEARCH.md`; live Odoo interaction/accessibility was not inspected.
- Added parser and API unit tests, UI preview/commit/error tests, and disposable-PostgreSQL integration tests for all-or-nothing behavior, reference conflict detection, persistence and audit. Latest unit suite: 86 tests pass; lint and diff checks pass. PostgreSQL integration and browser behavior remain unrun. Sandbox typecheck/build still fail on stale generated Prisma Client and unrelated existing errors; a clean Fedora-generated-client typecheck is needed before this slice is accepted.

## Phase 1A accessibility hardening — register table semantics (2026-10-19)

- Added visually-hidden captions and explicit column-header scopes to customer, driver, vehicle, and rental-request register tables. No visual layout or business behavior changed.
- Extended the existing Playwright flows to assert accessible table names while exercising the registers; test discovery and lint pass. Browser execution remains pending a local disposable PostgreSQL `_test` database and owner verification.

## Operational readiness endpoint (2026-10-19)

- Added `GET /api/health/ready` as a separate dependency-readiness probe; the existing `/api/health` remains a minimal uncached liveness response. Readiness checks PostgreSQL with `SELECT 1`, returns 503 without exposing internal error details, and disables caching.
- Unit tests cover healthy and unavailable database paths; a guarded disposable-PostgreSQL integration test is added but remains unrun in this sandbox. Playwright now waits for this database-aware endpoint before starting its browser flows. This is infrastructure status only, not a claim that business workflows or downstream providers are operational.

## Global response-header hardening (2026-10-19)

- Added `X-Content-Type-Options: nosniff` alongside the existing `Referrer-Policy: no-referrer` header. Deliberately did not add frame-blocking headers that could break Arena's embedded app preview; no UI or business behavior changed.
- Added a unit test for the global headers. Lint passes.

## Owner verification — generated-client typecheck (2026-10-19)

- Owner pulled `arena/8922811c-rts2` and confirmed it was up to date at `a4158b6`, ran `npm run db:generate` with Prisma 6.19.3, then reran `npm run typecheck`; typecheck passed with no errors.
- This verifies generated-client TypeScript compatibility for the pushed commit. It does not verify database migrations/integration tests or Playwright browser flows, which remain pending.


## Phase 1A — driver import possible-duplicate warnings (MIG-01/FLT-04; 2026-10-19)
- Refreshed `docs/API.md` to list the implemented customer, driver, vehicle, import and rental-request paths; the documentation calls out warning-only driver name matches and distinguishes implementation from outstanding integration/browser acceptance.
- Recorded owner-approved D-025 in `DECISIONS.md` and resolved the corresponding `OPEN_QUESTIONS.md` item. Matching names warn only; they never change import eligibility or create behavior.
- Driver preview now compares normalized names (Unicode NFC, case-insensitive, whitespace-collapsed) within the uploaded CSV and against existing company driver records. The row table displays advisory warnings, with explicit text that names are not identity and that valid rows remain separate records.
- Import-time validation also builds the same preview warnings. D-024 remains binding: actual validation errors still block the whole batch; warnings never block it. No row is skipped, merged, updated, or deduplicated.
- Added focused pure-unit coverage for name normalization and combined match sources, service tests proving malformed CSV avoids the company driver lookup, duplicate-name lookup stays company-scoped, and warnings do not block creation of separate audited records; an API route test confirms warnings are returned to preview callers; a component test verifies a visible warning alongside an enabled import action, disposable-PostgreSQL integration coverage for CSV-to-CSV and CSV-to-existing-record matches, tenant-isolated matching, and creation of all three rows, and expanded the browser E2E spec to preview/import both a name match against an existing company driver and repeated same-name rows as separate records. Full local unit/route/component, driver-service, vehicle-document projection/page and Playwright-config suite passes (40 files, 137 tests); focused import-warning/service/UI tests pass (3 files, 9 tests); lint and `git diff --check` pass. Local typecheck is blocked by stale generated Prisma Client types (including newly inferred Prisma `any` fallout); the user must regenerate the client and typecheck this change on Fedora. PostgreSQL integration and browser E2E execution remain unrun; Playwright lists all three E2E specs without environment credentials (`--list`); that discovery does not execute browser tests.

## Phase 1A — vehicle document date ledger (FLT-03 partial; 2026-10-19)
- Added a read-only Fleet Manager-authorized `/fleet/vehicles/documents` view over existing vehicle fields for Insurance, Roadworthiness, and Vehicle Registration expiry dates. The ledger uses company-scoped active vehicle records, search and pagination; each row links back to the editable vehicle record.
- This is date visibility only under D-017: no attachments, automatic reminders, expiry-status inference, deletion, or new date defaults. The view orders entered dates chronologically and omits unset dates.
- Added pure projection tests and page-level checks for manager-only access, recorded dates, and honest reminder copy; extended the disposable-database browser E2E flow with synthetic dates. The full unit suite passes (40 files, 133 tests), lint and diff checks pass, and Playwright discovers all three specs; actual browser execution and PostgreSQL integration remain unrun in this sandbox.

## Phase 1A — explicit RNT-03 buffer and release policy (D-031; 2026-10-19)
- Applied the standing recommendation policy: separate vehicle/driver non-negative whole-minute settings, no seeded values, zero only by an explicit audited entry, and no commitment when the relevant buffer is unset/invalid. D-031 also specifies release only on accepted pre-trip cancellation or actual completion with the required return/driver-assignment evidence; scheduled time alone never releases a reservation, and vehicle safety blocks remain independent.
- Added typed validation to the settings registry, a Super Administrator-only uncached endpoint exposing only these two values, and a dedicated editor requiring a reason for each change. Generic settings status continues to omit values. Values remain intentionally unset until the operator enters them.
- This is policy/configuration readiness only. It does not implement Confirmed/Assigned/cancellation/completion/return/reassignment transitions, availability checks, or the authoritative atomic reservation ledger; RNT-03 enforcement remains inactive.
- Added settings-domain, route-authentication, and UI tests (including explicit zero and no-default behavior). Focused tests pass (3 files, 15 tests); the full unit suite passes (47 files, 162 tests), lint and diff checks pass, and Playwright discovers all 3 E2E specs. Typecheck remains blocked by the checkout's stale generated Prisma Client, now also causing inferred row/transaction/type-export errors in the changed registry module; regenerate Prisma Client in the configured environment before accepting typecheck. PostgreSQL integration and browser E2E have not run.

## Phase 1A — limited post-submission rental review (D-032; 2026-10-19)
- Applied the recommended next safe slice: `Submitted → Under Review → Declined` only, using the existing D-023 `rental:manage` authority (Ops Manager/Super Administrator), mandatory reason, row lock, and one transaction for state, immutable status history, and audit. Decline is terminal in this slice.
- Added a dedicated transition API and detail-page actions. The interface explicitly states that review/decline does not quote, confirm, assign, reserve resources, or notify the customer. Dispatchers and other roles remain excluded by service authorization. No booking/reservation transitions or notification behavior were implied.
- Added transition-matrix tests, route/auth tests, UI tests, disposable-PostgreSQL integration coverage for role denial, history/audit, invalid moves and terminal decline, and extended the rental browser flow through submit, review and decline. The full unit suite passes (50 files, 170 tests); lint and diff checks pass; Playwright discovers 3 E2E specs. Integration and browser execution were not run; this checkout has no `DATABASE_URL`. Typecheck remains blocked by the stale/un-generated Prisma Client (existing missing Prisma exports and inferred `any` errors; no transition-specific type errors were reported).
- D-032 is recorded as a recommendation accepted under the owner's standing instruction. The next rental progression remains gated: quotation, confirmation, cancellation, assignment, and actual-trip completion/return workflows are still unimplemented; RNT-03 enforcement remains inactive.

## Typecheck follow-up — vehicle register category summary (2026-10-19)
- The owner regenerated Prisma Client and reported that Prisma's generated `vehicle.groupBy` type rejected the existing category-summary call. Replaced it with a parameterized PostgreSQL aggregate query that still groups/counts on the database, scopes by company, excludes archived vehicles, and orders categories consistently. Tests assert the SQL shape and tenant parameter.
- The focused summary tests pass. In this sandbox, Prisma Client regeneration is blocked by TLS failure fetching Prisma's schema engine; local typecheck therefore still shows unrelated stale-client errors, but the reported `groupBy` diagnostic is gone. The integration test covers the summary against PostgreSQL and should be run after the migration/database environment is available.


## Phase 1A — buffer-aware conflict-window helper (D-033; 2026-10-19)
- Added pure comparison semantics for the explicit D-031 buffers: use the earlier-ending trip, report conflict when its buffered end is after the later trip start, allow exact boundary adjacency, and fail closed on missing/invalid policy or malformed intervals. This helper does not query resources or claim availability.
- Added unit cases for exact boundary, short gap with reversed input order, unset/negative buffers, and malformed window. Reservation enforcement remains off until the authoritative ledger and approved lifecycle transitions exist.

## Phase 1A — submitted request review details (2026-10-19)
- Added an Ops Manager/Super Administrator-only read-only detail panel for non-Draft rental requests so the authorized reviewer can see the saved journey, passenger, vehicle/driver request, contact and notes fields before taking D-032's review/decline actions.
- The panel shows absent values explicitly and displays the separately stored return date/time without inferring a date; it does not permit edits after submission or expand access to Dispatcher scopes.
- Added a read-only quotation-prerequisite panel for Under Review requests. It lists the missing pricing, distance/time, tax, deposit, and validity settings without exposing values; recorded values are explicitly not presented as validated or approved. Only Super Administrators receive a link to the policy settings page; no quote action is enabled.
- Added component coverage for overnight values, missing data, policy blockers, and role-scoped settings navigation, and extended the rental browser scenario to assert the submitted detail and quotation-readiness views. This improves review usability without authorizing additional status transitions or reservation behavior.


## Phase 1A — quotation validity configuration (D-034; 2026-10-19)
- Applied the safe recommendation to expose quotation validity as a positive whole-day policy without inventing a duration. Added typed registry validation, a Super Administrator-only uncached read endpoint, and a dedicated audited settings form that requires a reason and leaves the input blank until explicitly entered.
- Unset/invalid validity remains a blocker for future quote creation; the form does not issue quotes, calculate expiry dates, authorize extensions, or enable acceptance.
- Added registry, API authorization, and UI tests. Actual setting value, quote validity calculation, expiry/extension rules, and quotation workflow remain unconfigured or unimplemented.

## Phase 1A — typed rental pricing-model configuration (D-035; 2026-10-19)
- Added an empty-by-default company setting for operator-entered rental pricing lines: unique code, label, typed basis (per trip/day/hour/kilometre), and positive whole-number rate in GHS pesewas. Super Administrator-only editor requires an audit reason; read endpoint returns only the typed setting.
- No lines, rates, model names, pricing calculations, tax/deposit assumptions, or quotation behavior are seeded or activated. The feature remains configuration readiness only; commercial values and calculation rules remain operator decisions.
- Added validation, duplicate-code and malformed-value tests, editor/API tests, and documented D-035 plus outstanding commercial-policy decisions.

## Phase 1A — typed tax and levy configuration (D-036; 2026-10-19)
- Added an empty-by-default, audited Super Administrator editor for accountant-confirmed tax/levy labels and non-negative integer basis-point rates; status, validation, a read-only uncached admin endpoint, and explicit clearing semantics are covered.
- No taxes, rates, taxable base, compounding, exemptions, order, rounding, or VAT status are assumed. The setting records inputs only and enables no quote or invoice arithmetic.
- Tests cover authorization, empty starting state, explicit rate entry/audit reason, malformed values, duplicates, and registry reads. Full unit suite passes (58 files, 191 tests); lint and diff checks pass; Playwright discovers 3 specs. Typecheck remains blocked by stale Prisma Client errors in existing auth/fleet/settings paths; this new editor has no reported diagnostics. PostgreSQL integration and browser E2E remain unrun.

## Phase 1A — typed deposit-policy configuration (D-037; 2026-10-19)
- Added an explicit, blank-by-default Super Administrator deposit editor for fixed GHS-pesewa amounts, percentage rates, or an explicitly chosen no-deposit policy; fixed/percentage choices also require a due stage. Changes use the audited settings write service and read via a no-store admin endpoint.
- No amount, percentage, no-deposit choice, payment proof rule, or refund behavior is preselected. The editor stores policy only; it performs no deposit calculations, booking confirmation, collection, or payment verification.
- Tests cover typed registry validation, malformed/incomplete policy rejection, explicit no-deposit and fixed-pesewa UI saves, and endpoint authorization. The full unit suite passes (60 files, 197 tests); lint and diff checks pass; Playwright discovers 3 specs. Typecheck remains blocked by stale Prisma Client errors in existing auth/fleet/settings paths; no deposit-editor diagnostics were reported. PostgreSQL integration and browser E2E remain unrun.

## Phase 1A — pure rental pricing-line arithmetic (D-038; 2026-10-19)
- Added an exact integer-arithmetic helper for a supplied pricing model and quantity: per-trip applies once, per-kilometre uses whole metres, per-hour uses whole minutes, and per-day uses elapsed 24-hour periods. Partial quantities are prorated and each individual line is rounded half-up once to pesewas; BigInt intermediates avoid floating-point currency drift.
- This helper neither chooses a model nor derives distance/duration, saves or issues a quote, calculates tax, or changes rental state. It is not connected to production quotation flows. Distance/time sources and actual business-line values remain unset/open.
- Added tests for all units, exact and half-pesewa rounding, missing/invalid quantities, and unsafe result bounds. Full unit suite passes (61 files, 202 tests); lint and diff checks pass. Typecheck remains blocked by stale generated Prisma Client errors in pre-existing auth/fleet/settings code; the pricing helper reports no diagnostics. PostgreSQL integration and browser E2E remain unrun.

## Phase 1A — requested-duration pricing quantity (D-039; 2026-10-19)
- Added a pure resolver for future time-priced quote quantities: use a stored positive whole-minute duration when there is no scheduled return; otherwise derive elapsed minutes from the persisted schedule using the existing explicit overnight-date semantics.
- When both duration and schedule are saved, they must agree exactly. Missing/invalid data, an ambiguous overnight return, or a mismatch fails closed. No request or status is changed and no quote is created.
- Added tests for explicit duration, scheduled same-day/overnight intervals, explicit return-date requirement, mismatch, missing data, and malformed inputs. The complete unit suite passes (62 files, 207 tests); lint and diff checks pass. Typecheck remains blocked by stale Prisma Client errors in existing auth/fleet/settings code; the quantity resolver reports no diagnostics. PostgreSQL integration and browser E2E remain unrun.

## Phase 1A — pure percentage-tax line arithmetic (D-040; 2026-10-19)
- Added an exact integer helper that applies an explicitly supplied non-negative taxable base and configured basis-point rate, rounding that one line half-up to pesewas. No tax base selection, compounding, exemption, ordering, or legal applicability is inferred.
- The helper is not wired to quotations or invoices. Tests cover base calculations, half-pesewa boundaries, explicit zero rates, invalid inputs and overflow. Full unit suite passes (63 files, 210 tests); lint and diff checks pass. Typecheck remains blocked by stale generated Prisma Client errors in pre-existing code; the tax helper reports no diagnostic. PostgreSQL integration and browser E2E remain unrun.

## Phase 1A — internal pre-tax rental pricing preview (D-041; 2026-10-19)
- Added a pure preview composer that accepts explicitly selected configured models and caller-supplied quantities, snapshots the selected model/rate per line, and safely sums pre-tax pesewa amounts. Empty selection, duplicate line identity, unknown models, and missing quantities are rejected.
- The helper is not persisted, authorized, customer-visible, or integrated with rental status. It performs no discount, tax, deposit, approval, validity, quote issuance, or acceptance behavior.
- Added tests for trip/distance/time line composition, snapshots/subtotals and fail-closed cases. Full unit suite passes (64 files, 213 tests); lint and diff checks pass. Typecheck remains blocked by stale Prisma Client errors in existing files; this helper reports no diagnostics. PostgreSQL integration and browser E2E remain unrun.

## Phase 1A — authorized internal rental pricing preview (D-042; 2026-10-19)
- Added a no-store GET/POST endpoint and Under Review-only interface for `rental:manage` users. The GET returns only configured pricing models; the preview uses explicit model selection, manually entered metres for per-kilometre lines, and D-039 request duration for time-priced lines.
- Output is labeled temporary, internal, and pre-tax; it is never saved or sent. It cannot approve, issue, accept, or change the rental request. Unconfigured pricing, non-Under-Review requests, unauthorized users, ambiguous duration, and missing quantities fail closed.
- Added route and component tests for manager authorization, request-state restriction, duration calculation, required distance, no-store output, and no-quote disclaimer. Full unit suite passes (66 files, 219 tests); lint and diff checks pass. Typecheck remains blocked by stale Prisma Client errors in existing auth/fleet/settings modules; no preview-specific diagnostics remain. PostgreSQL integration and browser E2E remain unrun.

## Phase 1A — immutable rental pricing worksheets (D-043; 2026-10-19)
- Added an append-only `RentalPricingWorksheet` record with company/request/user foreign keys, per-request version uniqueness, pricing-line snapshots, input quantities, pre-tax subtotal, and required reason. The migration adds database checks, indexes, restricted foreign keys, and an update/delete rejection trigger.
- Added an authorized Under Review-only creation service that row-locks the request, snapshots current configured rates, increments the version transactionally, and writes a value-minimized audit event. The UI requires explicit confirmation and reason after a preview; no version is silently saved. An uncached manager-only history endpoint and on-demand UI list expose the newest 20 versions while the request remains Under Review, including the immutable per-line rate, quantity, amount, reason, and timestamp snapshots.
- Worksheets are durable internal pre-tax records, never customer quotes. They do not change rental status or apply tax/discount/deposit/approval/validity or issuance. Unit tests cover route/service/UI behavior; a PostgreSQL integration spec now exercises sequential versions, audit, immutability, and status gating but remains unrun until a disposable `*_test` database is available.
- Full unit suite passes (68 files / 225 tests); lint and diff checks pass. `npm run typecheck` remains blocked by stale generated Prisma Client errors in existing scripts/auth/fleet/settings code, with no worksheet diagnostics. Prisma schema validation remains blocked by schema-engine download TLS disconnect; no migration application, PostgreSQL integration, or browser E2E was performed.

## Phase 1A — non-safety maintenance work-order intake (D-044; 2026-10-19)
- Added company-scoped maintenance work orders with restrictive company/vehicle/user foreign keys, a generated reference, explicit report date, optional un-defaulted work type and priority, and optional odometer reading paired with an explicitly chosen unit. Initial status is `Reported`; creation and audit event are atomic.
- The Fleet/Ops manager interface lists recent records and requires reason plus explicit confirmation that a report is not safety-related. API enforces company/global maintenance-management scope, active same-company vehicle, non-safety assertion, and private uncached responses.
- Safety-related work-order records are rejected; apply/release safety controls are a separate D-045 vehicle workflow. The D-046 reason-audited work-order lifecycle is implemented separately; assignment and safety-block linkage remain unimplemented.

## Phase 1A — vehicle safety-block apply and inspection release (D-045; 2026-10-19)
- Added a company-scoped `VehicleSafetyBlock` ledger with the approved three blocking statuses, restrictive FKs, one active block per vehicle, immutable applied details, a database trigger that permits only one release transition after completion and passed-inspection evidence, and an archive guard for actively blocked vehicles.
- Ops/Fleet Managers and Super Administrators can apply a block immediately with a reason. Authorized maintenance releasers can release only with an explicit completed-work timestamp, inspection results, passed-inspection confirmation and reason. Both operations lock the vehicle row and audit in the same transaction.
- Fleet vehicle projections expose active block ID/status/time; full managers see the reason, while limited fleet projections do not. Manager controls apply/release from the register. This is not a `Vehicle.status` manual edit. There are no assignment workflows yet, so assignment prevention is not live; any future assignment service must check the active block ledger transactionally. Work-order linkage remains deferred.
- Full unit suite passes (75 files / 249 tests); lint and diff checks pass; Playwright discovers 4 specs including the safety-block flow, but browser E2E was not executed. PostgreSQL migration/integration remain unrun. Prisma generation/schema validation still fail to download the schema engine due TLS disconnect; full typecheck/build remain blocked by stale generated client errors with no safety-block-specific diagnostics.

## Phase 1A — reason-audited maintenance work-order lifecycle (D-046; 2026-10-19)
- Added a manager-only fixed transition graph with a reason on every change, atomic current-status update, append-only sequence history and audit event. Approval is rejected when the reporter is the approving actor; optional planned work/parts may be entered at approval. The manager register exposes planned work/parts, completion/inspection evidence, optional costs rendered from integer pesewas, and the newest 50 immutable status-history events per work order with actor, timestamp and reason.
- Completion requires an explicit non-future timestamp and inspection results. Labour, parts and other cost amounts are optional, explicitly supplied integer pesewas; no cost is defaulted. This inspection information is a manager-recorded assertion, not independent verification.
- Database migration adds all statuses, history integrity/immutability triggers and a deferred current-status/latest-history consistency guard. Authenticated PATCH route and manager UI expose only the authorized next statuses. No assignment, safety-block release/linkage, invoice or payment behavior was added.
- Focused service, API-route and manager-UI tests pass (17 tests). The full unit run reports 71 files passed / 221 tests passed; five unrelated suites fail during setup because Prisma Client generation is unavailable (`.prisma/client/default` missing). Lint and `git diff --check` pass. Typecheck/build compile the app but fail on the pre-existing bootstrap-super-admin implicit-any error and stale generated Prisma Client types; the new service has no additional diagnostics beyond missing generated Prisma types. Schema validation/generation is blocked by the Prisma schema-engine TLS download failure. A PostgreSQL integration flow now covers full lifecycle and persisted history/costs but remains unrun without a disposable `*_test` database; browser E2E is not run (4 specs list successfully). Dependencies were restored with `npm ci --ignore-scripts` and reported 13 audit findings (2 moderate, 9 high, 2 critical).

## Phase 1A — limited rental-request reporting (RPT-01 partial; D-047/D-048; 2026-10-19)
- Added a manager-authorized, tenant-scoped all-time snapshot of persisted rental requests grouped by current status and recorded source, plus a distinct all-time count of audited `Draft → Submitted` events (including later-declined requests). Aggregates are read in one repeatable-read transaction and contain no customer-level details.
- The report labels Draft-inclusive counts separately from the submitted-enquiry KPI. Quotations/acceptance, confirmed/completed rentals, revenue/balances, vehicle utilisation and cancellation reasons are explicitly marked unavailable because their supporting records and transitions are not implemented; none is shown as zero.
- Added a workspace link and an uncached server-rendered report page. No filters, export, financial calculations, pricing, reservation or assignment behavior were added. Focused service/UI tests pass (4 tests); a PostgreSQL integration assertion compares the report count to the submitted-history ledger but has not run without a disposable `*_test` database. The rental-request Playwright flow now navigates to the report and verifies the submitted count and unavailable-metric labels; browser execution remains unrun. Lint and `git diff --check` pass. The app compiles in production-build mode, but build type validation stops at the existing `scripts/bootstrap-super-admin.ts:69` implicit-any error; full typecheck also has stale generated Prisma Client diagnostics.

## Phase 1B — corporate client register (CLI-01; 2026-10-20)

Added corporate client records as the first Phase 1B vertical slice, following the established customers-module patterns.

- **Prisma schema**: Added `Client` model (id, companyId FK, name required, registrationDetails/contactPerson/telephone/email/billingAddress/status/notes optional, archivedAt, timestamps) with `companyId` + `id` unique constraint and company-scoped indexes. Added `clients Client[]` relation to `Company`.
- **Migration**: `prisma/migrations/20261020120000_clients_register/migration.sql` creates the `Client` table, unique index, and company-scoped index.
- **Service layer** (`src/modules/clients/clients.ts`): `listClients`, `getClient`, `createClient`, `updateClient`, `archiveClient` with company-scoped `client:manage` permission enforcement, cursor pagination, soft archive, and audited create/update/archive events.
- **Zod schemas** (`src/modules/clients/client-schema.ts`): `clientInputSchema`, `clientRequestSchema` (with audit reason), `clientListQuerySchema`. Name is required; all other business fields optional with no defaults.
- **API routes**: `POST/GET /api/companies/[companyId]/clients` and `GET/PUT/DELETE /api/companies/[companyId]/clients/[clientId]` with session auth, error mapping, and private/no-store responses.
- **Pages** (`src/app/clients/page.tsx` + `client-manager.tsx`): server-rendered client register with search, cursor pagination, edit/history, and client create/edit/archive form with audit reason.
- **Tests**: `client-schema.test.ts` (Zod validation), `clients.integration.test.ts` (PostgreSQL CRUD, cross-company denial, cursor, archive).

| Feature ID | Status | Notes |
|---|---|---|
| CLI-01 | Tested | Corporate client register: schema, migration, service, API routes, pages, unit + integration tests. Integration suite green on Fedora (14 files / 58 tests, including 7 client tests) against `richie_tms_cli_test`. |
| CLI-02 | In Progress | Contracts implemented per D-049 (see CLI-02 section below); Fedora verification pending. |
| CLI-03 | In Progress | Corporate dashboard with audited client binding implemented locally (D-059, commit pending); awaiting Fedora verification and owner ratification. |
| EMP-01 | Not Started | Employee register. |
| EMP-02 | Not Started | CSV import with preview and row-level errors. |
| EMP-03 | Not Started | Employee management: shifts, locations, eligibility. |
| RTE-01 | Not Started | Locations and stops. |
| RTE-02 | Not Started | Routes. |
| RTE-03 | Not Started | Recurring schedules. |
| RTE-04 | Not Started | Explainable planning aid. |
| BKG-01 | Not Started | Booking types. |
| BKG-02 | Not Started | Booking validation. |
| BKG-03 | Not Started | Booking workflow. |
| BKG-04 | In Progress | Trip assignment with transactional capacity check implemented locally (D-053, commit pending); awaiting Fedora verification. |
| BKG-05 | In Progress | Creation cut-off via typed setting, waiting-list queue view implemented locally (D-056, commit pending); cancellation deadlines remain unconfigured/unapproved. |
| BKG-06 | In Progress | Booking change history implemented in D-052 (append-only history + API/UI); Fedora verification pending. |
| TRP-01 | In Progress | Trip records, lifecycle state machine and schedule generation implemented locally (D-053, commit pending); awaiting Fedora verification. |
| TRP-02 | In Progress | Passenger manifests implemented locally (D-053, commit pending); awaiting Fedora verification. |
| DSP-01 | In Progress | Daily dispatch board implemented locally (D-054, commit pending); awaiting Fedora verification. |
| DSP-02 | In Progress | Vehicle/driver assignment with hard blocks and override-and-reason implemented locally (D-054, commit pending); awaiting Fedora verification. |
| DSP-03 | In Progress | Emergency trips via the audited manual trip creation path (D-054, commit pending); awaiting Fedora verification. |
| DSP-04 | In Progress | No-show recording and lifecycle delays implemented locally (D-054, commit pending); awaiting Fedora verification. |
| DRV-01 | In Progress | Mobile-first driver home implemented locally (D-055, commit pending); awaiting Fedora verification. |
| DRV-02 | In Progress | Driver actions with idempotent event APIs implemented locally (D-055, commit pending); navigation stays text-only (names/locations) without a map provider. |
| DRV-04 | In Progress | Driver defect/interruption reporting implemented locally (D-055, commit pending); awaiting Fedora verification. |
| FIN-01 (contract pricing) | Not Started | Contract pricing models. |
| FIN-02 (corporate invoice) | Tested | Corporate invoice generation with duplicate-billing protection (D-057/D-058); DRAFT-only lifecycle confirmed at the Phase 1B gate (D-060). Fedora-verified 2026-10-21 at commit 3e32798. |

## Phase 1B — corporate contracts (CLI-02; D-049; 2026-10-20)

Added the contract register as the second Phase 1B vertical slice, following the rental-request/work-order lifecycle patterns.

- **Prisma schema**: Added `Contract` (companyId, clientId composite FK to `Client`, generated `CON-…` reference unique per company, optional serviceType/startDate/endDate/renewalDate, routesAndStops, serviceDaysAndShifts, vehicleRequirements, pricingModel, billingFrequency, paymentTerms, serviceLevelTargets, notes — all optional agreed text with no defaults) and append-only `ContractStatusHistory`. Added `contracts` relations to `Company`/`Client` and `contractStatusChanges` to `User`.
- **Migration**: `prisma/migrations/20261020130000_contracts/migration.sql` creates both tables with a status CHECK, an ordered-dates CHECK, a history allowed-transition CHECK, an append-only history trigger, a status-transition guard trigger (contracts are created as Draft; approval to Active requires start/end dates), and deferred history-required/history-matches constraint triggers.
- **Lifecycle (D-049)**: Draft → Pending Approval → Active; Pending Approval → Draft for amendment; Active → Suspended/Expired/Terminated; Suspended → Active/Expired/Terminated; Expired → Active only as a renewal carrying a new end date that has not passed. Terminated is terminal. Drafts are the only editable state. Suspended reactivation is refused once the end date has passed. Expired/suspended contracts and past-end-date Active contracts surface explicit warnings; whether bookings are allowed under them remains governed by the unset `contracts.inactive_booking_policy` setting and is enforced later in BKG-02.
- **Service layer** (`src/modules/contracts/contracts.ts`): `listContracts` (search/status/client filters, cursor pagination), `getContract` (with status history), `createContract`, `updateContractDraft`, `transitionContract` (row-locked `FOR UPDATE`, transition-table and precondition checks, history + audit in one transaction), all behind company-scoped `client:manage`.
- **API routes**: `GET/POST /api/companies/[companyId]/contracts`, `GET/PUT /api/companies/[companyId]/contracts/[contractId]`, `POST /api/companies/[companyId]/contracts/[contractId]/transition`, with session auth, typed error mapping (400/403/404/409), and private/no-store responses.
- **Pages** (`src/app/contracts/page.tsx` + `contract-manager.tsx`): searchable/filterable contract register, Draft create/edit form with client picker, status-change controls with renewal dates for Expired contracts, approval/status history panel, and explicit unavailable-feature notes (attachments, automatic renewal reminders). Workspace navigation now links Corporate clients and Contracts for `client:manage` users.
- **Tests**: `contract-schema.test.ts` (validation, renewal-date rules), `contract-transitions.test.ts` (every ordered from-to pair in the 6×6 matrix), `contracts.integration.test.ts` (PostgreSQL CRUD, approval preconditions, lifecycle and renewal, suspended-reactivation refusal, cross-company denial, database guard and append-only history enforcement). Not yet run: sandbox has no `node_modules`/database; Fedora verification commands issued with this slice.
- **Limits**: No contract attachments (no file-storage provider selected), no automated renewal reminders (delivery channel/recipients unresolved), no structured route/stop links (RTE-02), no money computation from pricing text (FIN-01), no booking-eligibility enforcement (BKG-02), and no automatic expiry job; expiry is a reason-recorded manual transition plus on-screen warnings.

| Feature ID | Status | Notes |
|---|---|---|
| CLI-02 | In Progress | Contract register implemented; unit/integration/E2E verification on Fedora pending. CLI-03 (corporate dashboard) not started. |

## Phase 1B — employees and CSV import (EMP-01/02/03; D-050; 2026-10-20)

Added the employee register as the third Phase 1B vertical slice, following the customers/clients register patterns and the established CSV-import machinery.

- **Prisma schema**: Added `Employee` (companyId, clientId composite FK to `Client`, optional company-unique reference, required fullName, restricted telephone/email/homeAddress/accessibilityNeeds, department, workLocation, shift, approved pickup/drop-off landmark text, accountStatus, nullable transportEligible, notes, archivedAt) with company/client indexes. Added `employees` relations to `Company`/`Client`.
- **Migration**: `prisma/migrations/20261020140000_employees/migration.sql` creates the table, unique indexes, and a non-empty-name CHECK.
- **Service layer** (`src/modules/employees/employees.ts`): `listEmployees` (search/client/eligibility filters, cursor pagination), `getEmployee` with audit history, `createEmployee`, `updateEmployee` (eligibility toggle), `archiveEmployee`, `previewEmployeeImport`, `importEmployeesFromCsv`, `exportEmployeesCsv` — all behind company-scoped `employee:manage`; narrower scopes fail closed. References are checked for company uniqueness in-transaction with a P2002 race guard.
- **Import** (`employee-import.ts` + constants): fixed 14-column template (`fullName` required), TRUE/FALSE/blank eligibility, repeated/existing references as row errors, same-name-and-contact likely duplicates as warnings only, all-or-nothing audited import (D-024/D-050).
- **API routes**: `GET/POST /api/companies/[companyId]/employees`, `GET/PUT/DELETE /api/companies/[companyId]/employees/[employeeId]`, `POST .../employees/import/preview`, `POST .../employees/import`, `GET .../employees/export` (CSV attachment, restricted fields excluded).
- **Pages** (`src/app/employees/page.tsx` + `employee-manager.tsx`): searchable/filterable register, create/edit/archive forms, CSV template download, preview table with per-row errors/warnings, and confirm-import flow. Workspace navigation links Employees for `employee:manage` users.
- **Tests**: `employee-schema.test.ts`, `employee-import.test.ts` (parsing, eligibility, duplicate references, likely-duplicate warnings, header/email errors), `employees.integration.test.ts` (PostgreSQL CRUD, eligibility toggle, unique reference, cross-company and dispatcher-scope denial, preview/all-or-nothing import, export exclusion). Not yet run: sandbox has no `node_modules`/database; Fedora verification is batched with CLI-02.
- **Limits**: No HR self-service or dispatcher roster projection (fail closed), no structured locations/shifts yet (RTE), no booking enforcement (BKG-02), archive only.

## Phase 1B — locations, routes, schedules, planning aid (RTE-01..04; D-051; 2026-10-20)

Added the routes domain as the fourth Phase 1B vertical slice.

- **Prisma schema**: Added `Location` (optional Decimal coordinate pair, landmarkDescription, ghanaDigitalAddress), `Route` (client FK, `RTE-…` reference, origin/destination location FKs, planned start/duration/capacity, operating-day codes, shift text, active flag), `RouteStop` (ordered, kind, planned offset), and `RouteSchedule` (RECURRING/ONE_TIME shapes) with company-scoped indexes and relations on `Company`/`Client`.
- **Migration**: `prisma/migrations/20261020150000_routes_locations/migration.sql` with coordinate pair/range CHECKs, time-format CHECKs, stop-kind and schedule-shape CHECKs, and unique stop-sequence and reference constraints.
- **Service layer** (`src/modules/routes/`): locations CRUD; routes CRUD plus `setRouteStops` (audited whole-order replacement = dispatcher override) and `getRoutePlan`; schedules with overlap conflict detection across recurring/one-time shapes, template copy, and audited activation toggles — all behind `route:manage` (GLOBAL/COMPANY).
- **Planning aid** (`route-plan.ts`): pure, unit-tested; recorded offsets only, unmapped-stop flags, largest-seat capacity assessment, always labelled manual/approximate with the no-map-provider disclosure.
- **API routes**: locations, routes, route stops, route schedules, schedule copy/activation, and route plan endpoints with typed error mapping (conflicts return 409 with the conflicting schedule descriptions).
- **Pages** (`src/app/routes/`): location register + manager, route register, route editor with stop-order editor, manual plan panel, and schedule panel (add/copy/activate with audited reasons). Workspace navigation links Routes and schedules.
- **Tests**: `route-plan.test.ts`, `route-schema.test.ts`, `routes.integration.test.ts` (locations, stop-order override, plan capacity, schedule conflicts/copy/reactivation, cross-company denial). Not yet run: sandbox has no `node_modules`/database; Fedora verification is batched with CLI-02/EMP.
- **Limits**: No map provider, no trip generation (TRP-01), no availability/assignment checks (DSP-02), no optimisation (RTE-05, Phase 3).

## Phase 1B gate — evidence COMPLETE; owner decisions APPROVED (D-060); awaiting owner declaration of closure

- **Verified at commit `3e32798`** by `./scripts/verify-phase1b.sh` on a fresh disposable database
  (`richie_tms_p1b_20261021011206_test`): Prisma generate ✅, 21/21 migrations ✅, `tsc --noEmit` ✅,
  ESLint ✅ (0 errors; 2 pre-existing Phase 1A warnings in `customer-picker.tsx`), **unit suite 373/373 ✅**
  (incl. the full 7×7 booking and 8×8 trip state matrices), **integration suite 105/105 ✅** against real
  PostgreSQL. Log: `verification-logs/phase1b-20261021011206.log`.
- **Exit criteria demonstrated by those tests:** the cross-slice `workflow.integration.test.ts` walks one
  Monday end to end — contract → bookings → schedule trip generation → resource assignment → booking
  assignment → dispatch no-show → linked-driver START/BOARD/COMPLETE → per-passenger invoice billed exactly
  once → bound-HR corporate dashboard. Per-slice suites cover cross-company isolation on every
  company-scoped route, capacity under parallel assignment (exactly one of two racers wins), schedule
  generation idempotency, dispatch hard blocks (safety block, expired licence) that override cannot bypass,
  driver idempotent events with own-trips-only isolation, invoice duplicate-billing protection, and the
  no-map dispatch board.
- **Re-confirmed at gate commit `d540c68` (2026-10-21):** `./scripts/verify-phase1b.sh` 7/7 green on
  `richie_tms_p1b_20261021014258_test` with both D-060 registry rows registered. **E2E (§3): 4/4 specs
  pass** on the fresh `richie_tms_e2e_phase1b_test` database — the last spec
  (`vehicle-safety-blocks.spec.ts`) initially failed on a spec defect (test-host-local, minute-truncated
  work-completed instant preceding `appliedAt`; release correctly refused) and passed after the helper
  was fixed to Africa/Accra wall time with seconds precision (commit `44a7e93`). No service change.
- **Owner decisions (APPROVED 2026-10-21, recorded as D-060):** D-059 ratified as built; settings-registry
  rows approved for `bookings.creation_cutoff` (D-056) and `finance.corporate_rates` (D-058) — both now
  registered; DRV-03/DRV-05 formally descoped for Phase 1B; DRAFT-only invoice lifecycle confirmed.
- **Gate closed (owner declaration, 2026-10-21):** with all evidence green and the D-060 decisions
  recorded, the owner formally declared the Phase 1B gate closed. Phase 1C planning may begin;
  Phase 1C construction requires a separate owner go-ahead, and the descoped items (DRV-03/DRV-05,
  invoice issuance/payment/void lifecycle) require their own decisions first.

## Phase 1B — corporate dashboard (CLI-03; D-059; 2026-10-21)

- **Decision recorded (D-059, owner ratification requested).** The HR-to-client binding is resolved with the
  driver-link pattern: an audited `UserClientBinding` (one active binding per user per company, revoke-only
  mutation guard) binding a Corporate HR Admin login to one client. Without a binding the dashboard denies
  explicitly; the role alone never widens access.
- **Implemented locally (unverified until Fedora runs).** Migration `20261020200000_client_bindings`,
  binding/revoke services behind `client:manage` GLOBAL/COMPANY, the CLI-03 read model (client profile,
  booking counts and recent bookings, employees without restricted fields, contracts, invoices, upcoming
  trips — every query filtered by the bound client), a `/corporate` page, binding APIs and home navigation.
- **Tests written (not yet run in sandbox).** PostgreSQL integration: bound HR sees only its client's
  bookings/employees with exact projected keys; unbound HR is denied; double-binding is refused; revoke ends
  access and re-binding works; a binding never leaks into another company.
- **Batch verification.** CLI-02, EMP, RTE, BKG, TRP, DSP, DRV, FIN-02 and CLI-03 remain Fedora-unverified;
  batched commands are recorded for the Phase 1B gate per the owner's standing instruction. D-059 must be
  ratified (or reshaped) by the owner at the gate.

## Phase 1B — corporate invoices (FIN-02; D-057/D-058; 2026-10-21)

- **Implemented locally (unverified until Fedora runs).** Migration `20261020190000_corporate_invoices` adds
  immutable `CorporateInvoice`/`CorporateInvoiceLine` tables (amount/period CHECKs, unique contract+period,
  partial unique index so a trip is billed once). Money comes only from the typed `finance.corporate_rates`
  setting (D-058; PER_TRIP/PER_PASSENGER pesewas rates, validated in the settings registry); generation fails
  closed without a rate, bills Completed trips with Completed contract bookings, applies configured tax lines,
  and is idempotent per contract+period (a duplicate generation returns the stored invoice). Note: trips
  completed later for an already-invoiced period need a fresh period. APIs under
  `/api/companies/[companyId]/invoices` and a `/invoices` UI; `invoice:manage` GLOBAL/COMPANY per
  `docs/PERMISSIONS.md`; home navigation links Invoices.
- **Settings gap recorded.** `bookings.creation_cutoff` and `finance.corporate_rates` are validated in the
  registry module but are not yet rows in `settingRegistry`, so the settings UI cannot configure them until
  the owner approves the registry rows (see `docs/OPEN_QUESTIONS.md`). Generation fails closed in the meantime.
- **Tests written (not yet run in sandbox).** PostgreSQL integration: no-rate refusal, per-passenger invoice
  totals (GH₵150.00), duplicate generation returning the same invoice, no-billable-trips refusal,
  cross-company denial.
- **Batch verification.** CLI-02, EMP, RTE, BKG, TRP, DSP, DRV and FIN-02 remain Fedora-unverified; batched
  commands are recorded for the Phase 1B gate per the owner's standing instruction.

## Phase 1B — booking cut-off and waiting list (BKG-05a/05b, BKG-06; D-056; 2026-10-21)

- **Implemented locally (unverified until Fedora runs).** `bookings.creation_cutoff` is a typed settings-registry
  value (`NONE` or `HOURS_BEFORE_JOURNEY` with 0–720 hours); unconfigured stays NONE so existing behaviour never
  changes silently, and `createBooking` blocks journeys inside the window with an explanatory error. The waiting
  list is a read model over Accepted bookings for a trip's date/client/route in request order with explicit
  seat-availability status (null when no capacity basis exists); promotion stays manual through the
  transactional assignment path. BKG-06 (booking change history) was delivered with D-052 (append-only history
  served by the booking detail API/UI). Cancellation deadline rules are not invented — they remain an open
  business choice and are unenforced until approved.
- **Tests written (not yet run in sandbox).** PostgreSQL integration: waiting list ordering, promotion shrinking
  the queue, `seatsAvailable` flipping to false at capacity; cut-off blocks a tomorrow journey at 720 hours and
  allows it again under NONE.
- **Batch verification.** CLI-02, EMP, RTE, BKG, TRP, DSP, DRV and this slice remain Fedora-unverified; batched
  commands are recorded for the Phase 1B gate per the owner's standing instruction.

## Phase 1B — driver interface and idempotent events (DRV-01/02/04; D-055; 2026-10-21)

- **Implemented locally (unverified until Fedora runs).** Migration `20261020180000_driver_events` adds the
  optional `Driver.userId` login link (unique) and the `DriverEvent` table (unique on
  company+trip+idempotency key) with event-type CHECKs. `src/modules/driver/` provides link-driver-account
  (driver:manage GLOBAL/COMPANY, audited), own-trip reads (DRIVER role `OWN_TRIP_EVENTS` scope plus the link;
  unlinked accounts are explicitly denied), and `postDriverEvent` applying START/DELAY/RESUME/INTERRUPT/
  COMPLETE/BOARD/NO_SHOW/REPORT_DEFECT exactly once per key: replays return the stored result marked duplicate,
  the same key with another event conflicts, and trip/booking changes reuse the D-052/D-053 guards (completion
  finishes Boarded bookings). Manifest projection stays name/type/pickup/drop-off only. APIs under
  `/api/companies/[companyId]/driver/trips` and a mobile-first `/driver` page with large touch targets.
- **Tests written (not yet run in sandbox).** PostgreSQL integration: a driver sees only their own trip;
  unlinked driver accounts are denied; START replayed with the same key is a duplicate and writes no second
  history row; key reuse for another event conflicts; DELAY → BOARD → COMPLETE finishes the booking; a second
  linked driver sees an empty list and cannot read or post events on the first driver's trip.
- **Noted.** DRV-03 and DRV-05 have no definition in the approved documents and await the owner; defects do not
  auto-block the vehicle (dispatcher/fleet action). Batch Fedora verification of CLI-02, EMP, RTE, BKG, TRP,
  DSP and DRV remains at the next phase transition per the owner's standing instruction.

## Phase 1B — dispatch board, assignment, no-shows (DSP-01..04; D-054; 2026-10-21)

- **Implemented locally (unverified until Fedora runs).** `src/modules/dispatch/` provides the day board
  (`getDispatchBoard`: trips with resources, load/capacity and conflict warnings, plus accepted bookings not
  yet on a trip — no map provider, no optimisation claims), DSP-02 resource assignment inside a trip-row-locked
  transaction with hard blocks (archived vehicle, active vehicle safety block, archived driver, expired driver
  licence) that even an override cannot pass, and overridable conflicts (same-day vehicle/driver conflicts,
  vehicle seats below the trip requirement, passengers above vehicle seats) that require `override: true` plus
  the audited reason, DSP-03 emergency trips through the existing audited manual creation path, and DSP-04
  no-shows (Assigned booking → Cancelled with the no-show reason in history; seat freed) plus lifecycle delays.
  Cancelling a trip releases Assigned bookings back to Accepted with history and audit. APIs: board GET, trip
  `resources` and `noshow` POSTs; `/dispatch` UI with per-trip resource and no-show panels; home navigation
  links Dispatch.
- **Tests written (not yet run in sandbox).** PostgreSQL integration: board contents and load; safety-blocked
  vehicle and expired-licence hard blocks even with override; same-day driver conflict requires override and
  then audits the warning; below-requirement vehicle needs override and the large vehicle assigns cleanly;
  no-show frees the seat and cancels the booking; cross-company denial.
- **Follow-ups recorded.** Driver-side events, boarding and completion remain DRV-01/02; bulk release on trip
  cancellation is implemented here per D-054 (superseding the D-053 dispatch follow-up note). Batch Fedora
  verification of CLI-02, EMP, RTE, BKG, TRP and DSP remains at the next phase transition per the owner's
  standing instruction.

## Phase 1B — trips, manifests and capacity (TRP-01/02, BKG-04; D-053; 2026-10-21)

- **Implemented locally (unverified until Fedora runs).** Migration `20261020170000_trips` adds `Trip` and
  append-only `TripStatusHistory` to PostgreSQL, `Booking.tripId` with a composite FK, a partial unique index
  `(companyId, scheduleId, tripDate)` so regenerating schedule occurrences creates nothing twice, and database
  status guards (creation must be Planned, transition allowlist, history-required and history-matches triggers)
  matching the contract/booking pattern. `src/modules/trips/` provides the transition table (full 8×8 matrix
  unit-tested), typed schemas, and services: manual creation (route defaults snapshot), schedule generation
  (≤31 days, created/skipped counts), lifecycle transitions (dispatch requires vehicle+driver; actual start/end
  stamped), transactional booking assignment with the trip row locked (capacity basis = assigned vehicle seats
  else recorded limit), unassignment, and the passenger manifest projecting only name/type/pickup/drop-off.
  APIs under `/api/companies/[companyId]/trips` (list/create, generate, detail, transition, manifest, assign,
  unassign) and a `/trips` UI (register, filters, create + generate forms, lifecycle panel, manifest,
  assignment panel) gated on `trip:dispatch` GLOBAL/COMPANY; home navigation links Trips.
- **Tests written (not yet run in sandbox).** Unit: full trip matrix and exact transition set. Integration
  (PostgreSQL): schedule generation creates 5 weekday trips and reruns skip 5; one-seat trip assignment,
  over-capacity refusal, unassign, and two parallel assignments where exactly one succeeds; manifest entry keys
  exclude restricted employee fields; dispatch refused without resources; lifecycle walk through Delayed to
  Completed with actual times; cross-company denial.
- **Follow-ups recorded.** Vehicle/driver assignment UI is DSP-02; bulk release of Assigned bookings when a
  trip is cancelled is a dispatch operational action for the DSP slice; driver-side boarding/completion events
  are DRV-01/02. Batch Fedora verification of CLI-02, EMP, RTE, BKG and TRP remains at the next phase transition
  per the owner's standing instruction.

## Phase 1B — bookings (BKG-01..03; D-052; 2026-10-21)

Added bookings as the fifth Phase 1B vertical slice.

- **Prisma schema**: Added `Booking` (employee/client/contract/route/pickup/drop-off relations, `BKG-…` reference, type, journey date, status) and sequenced append-only `BookingStatusHistory`, with relations across `Company`, `Client`, `Employee`, `Contract`, `Route`, `Location`, and `User`.
- **Migration**: `prisma/migrations/20261020160000_bookings/migration.sql` with status/type CHECKs, a partial unique index preventing duplicate live journeys, and the full guard-trigger set (created-as-Pending, transition table, append-only history, history-required/matches).
- **Settings**: `contracts.inactive_booking_policy` is now a typed ALLOW/BLOCK setting with a `getInactiveContractBookingPolicy` reader; unset or invalid values read as unconfigured so dependent bookings block with an explanation.
- **Service layer** (`src/modules/bookings/`): `createBooking` with the BKG-02 validation chain, `listBookings`, `getBooking` with sequenced history, and `transitionBooking` restricted to staff decisions (accept/reject/cancel) — all behind `booking:manage` (GLOBAL/COMPANY).
- **API routes**: `GET/POST /api/companies/[companyId]/bookings`, `GET /api/companies/[companyId]/bookings/[bookingId]`, `POST .../bookings/[bookingId]/transition` with 400/403/404/409 mapping.
- **Pages** (`src/app/bookings/`): searchable/filterable booking register, validated create form, and accept/reject/cancel panel with history. Workspace navigation links Bookings.
- **Tests**: `booking-transitions.test.ts` (full 7×7 matrix), `bookings.integration.test.ts` (validation chain, suspended-contract policy ALLOW/BLOCK/unset, duplicate prevention including parallel requests and rebooking after cancellation, manual-assignment refusal, cross-company denial). Not yet run: sandbox has no `node_modules`/database; Fedora verification is batched with CLI-02/EMP/RTE.
- **Limits**: No trip assignment/capacity (TRP-01/BKG-04 next), no waiting list or cancellation deadlines (BKG-05), no cut-off enforcement (unconfigured), staff-side creation only.

Phase 1A remains complete: all 4 E2E specs pass against the cleaned test DB (1 company: Richie Transport Services), unit tests 337/337 pass, integration tests 51/51 pass, typecheck and build pass.

## Phase 1C — corporate invoice lifecycle and payments (FIN-02 extension, FIN-03; D-061/D-062; 2026-10-21)

First Phase 1C slice, built under the owner's Phase 1C go-ahead ("go ahead start building phase 1c
completely after i will run", 2026-10-21). D-061/D-062 are recorded in `docs/DECISIONS.md` for
ratification at the Phase 1C gate.

- **Lifecycle (D-061):** `DRAFT → ISSUED → PAID`, `VOID` from `DRAFT`/`ISSUED`, both terminal,
  via `invoice-transitions.ts` + row-locked `transitionCorporateInvoice` + append-only
  `CorporateInvoiceStatusHistory`. Amounts/lines/reference/period/contract are immutable after
  generation (DB change guard); voiding is refused once payments exist (service + DB guard);
  voiding releases trips and the contract+period (trigger-maintained `billingActive`,
  status-aware partial unique indexes) so a replacement invoice can be generated.
- **Payments (D-062 / FIN-03):** append-only `InvoicePayment` (amount, method, external
  reference, received date, reason) recorded only against ISSUED invoices by `payment:record`
  (or `invoice:manage`) GLOBAL/COMPANY scope; the invoice row lock recomputes the balance so
  parallel payments cannot overpay; full payment flips the invoice to PAID atomically with its
  history row. Outstanding is always derived, never stored; part-paid is a balance, not a status.
- **Surface:** `POST .../invoices/[invoiceId]/transition` and `POST .../invoices/[invoiceId]/payments`
  APIs; list gains a `status` filter; the invoices page shows paid/outstanding everywhere and a
  lifecycle panel (issue/mark-paid/void, payment form, payments table, status history); the
  corporate (bound-HR) dashboard now shows invoice status and outstanding.
- **Tests (Fedora-verified 2026-10-21 at commit 51bfbd6; log
  verification-logs/phase1c-20261021132250.log):** 23/23 migrations on real PostgreSQL, typecheck
  clean, lint 0 errors, unit 375/375 (incl. the new 4×4 invoice transition matrix), integration
  111/111 incl. `invoice-lifecycle.integration.test.ts` 6/6 and the pre-existing FIN-02 suite 4/4.
  Sandbox pre-verification (PGlite + adapter-backed client) matched, including DB-guard assertions
  for duplicate billing, payment on DRAFT, void-with-payments, append-only rows, immutability,
  history pairing, and void release with same-period replacement.
- **Limits:** No credit notes/adjustments (void-with-payments is refused instead), no payment
  verification/reconciliation workflow (FIN-08 is Phase 3), no overdue status/job, no PDF
  (RPT-05 is Phase 3), rental invoices/payments remain the Phase 1A rental scope, and configuring
  `finance.corporate_rates` still happens through the settings service (no dedicated editor yet).
- **Remaining Phase 1C scope:** PAX-01 passenger portal, RNT-09 rental customer portal,
  RPT-02/RPT-03/RPT-04 reports and exports, FIN-07 finance dashboard, role dashboards and the
  hardening pass, per `richie-tms-phase-prompts.md`. Next slice: FIN-07 finance dashboard.

## Phase 1C — finance dashboard (FIN-07; D-063; 2026-10-21)

Second Phase 1C slice, built under the owner's Phase 1C go-ahead. D-063 is recorded in
`docs/DECISIONS.md` for ratification at the Phase 1C gate.

- **Semantics (D-063):** `getFinanceDashboard` rolls up the corporate invoice/payment transaction
  records only (the sole invoice/payment records in Phase 1). Recognised revenue = ISSUED + PAID
  invoice totals; payments received = Σ `InvoicePayment`; outstanding = Σ (total − payments) over
  ISSUED invoices, always derived. DRAFT is pipeline, VOID is count/total only. The identity
  revenue = payments + outstanding is computed on every response (`reconciliation.reconciles`).
  Per-client invoiced/paid/outstanding rows and payments-by-method sum back to the headlines.
- **Window & coverage:** an optional ≤366-day window drives only the activity section (payments by
  `receivedAt`; recognition by the append-only ISSUED history timestamp of still-standing
  invoices); balances are point-in-time. Africa/Accra is UTC year-round, so UTC day bounds are the
  local bounds `docs/KPIS.md` requires. Coverage is reported as numerator/denominator pairs
  (issue-timestamp coverage, payments with method, payments with reference).
- **Honesty rules:** margin is `INSUFFICIENT_DATA` (no attributable cost records until FIN-05,
  Phase 3); rental revenue, expenses/cost-per-trip and due-date ageing are listed as unavailable
  with reasons rather than estimated — per the FIN-07 rule that margin appears only when cost and
  revenue data are sufficient.
- **Surface:** `GET /api/companies/[companyId]/finance-dashboard`, the `/finance` page (totals,
  status/method/client tables, activity, coverage, reconciliation banner, insufficient-data
  panel, date-window form), home/invoices navigation links. Authorisation mirrors the invoice
  register (`invoice:manage` GLOBAL/COMPANY: Finance Officer, Super Administrator).
- **Tests:** unit `dashboard-summary.test.ts` (status semantics, tie-out true/false, client
  sorting, empty ledger); integration `finance-dashboard.integration.test.ts` (6 tests: headline
  reconciliation against a 5-invoice/2-client fixture, per-client/method breakdowns and coverage,
  windowed activity vs point-in-time balances, insufficient-data reporting, read-only/unrelated
  denial + empty-company isolation, window validation). Fedora run pending.
- **Remaining Phase 1C scope:** RPT-02/RPT-03/RPT-04 next (FIN-07 supplies their reconciliation
  proof), then PAX-01 passenger portal, RNT-09 rental customer portal, role dashboards and the
  hardening pass, per `richie-tms-phase-prompts.md`.

## Phase 1C — reports and exports (RPT-02, RPT-03, RPT-04; D-064; 2026-10-21)

Third Phase 1C slice, built under the owner's Phase 1C go-ahead. D-064 is recorded in
`docs/DECISIONS.md` for ratification at the Phase 1C gate.

- **RPT-02 (`getTransportReport`):** booking flow counted from `BookingStatusHistory` event
  timestamps as distinct bookings per transition (received/confirmed/boarded/completed/cancelled/
  rejected), no-shows from no-show cancellation reasons (both dispatch and driver paths),
  passengers transported = bookings reaching Completed. Pickup delay compares BOARD history times
  with trip planned starts (`tripDate` + `plannedStartTime`); both average-delay variants and
  coverage are shown, but the on-time *rate* is withheld (threshold is an unset owner policy).
  Route utilisation sums boarded/completed passengers over `capacityLimit` for Completed trips
  with capacity + manifest, excluded trips counted. Fleet: category counts, active safety blocks,
  archived count; document expiry from vehicle date fields + driver licences (in-window and
  already-expired). Maintenance: work orders by status with recorded cost sums and coverage.
  Downtime, fuel/mileage and contract performance are declared insufficient-data with reasons.
- **RPT-03 (`getFinanceReport`):** FIN-07's reconciled totals plus windowed revenue by client and
  by contract service type (standing invoices by ISSUED history timestamp), payments in window by
  method, and the point-in-time outstanding-invoice list (capped at 100, totals uncapped).
  Expenses, cost per trip/passenger and margin remain insufficient-data.
- **RPT-04:** both services share one filter schema (window ≤366 days; client, route, driver,
  vehicle, service type, status) applied inside permission-scoped queries. CSV exports are built
  from the same service results (no separate export queries) with `#` metadata lines for period,
  generation time, timezone (Africa/Accra), formulas and coverage. Authorisation: seeded
  `report:export` — transport requires GLOBAL/OPERATIONAL/DISPATCH_SCOPE/FLEET_SCOPE, finance
  requires GLOBAL/FINANCE_SCOPE; exports inherit the identical checks.
- **Surface:** `/reports` hub (permission-aware), `/reports/transport`, `/reports/finance` pages
  with filter forms and CSV download links, four API routes (`reports/transport`,
  `reports/transport/export`, `reports/finance`, `reports/finance/export`), home navigation.
- **Tests:** unit `csv.test.ts` + `report-math.test.ts`; integration `reports.integration.test.ts`
  (7 tests over a two-trip + no-show + maintenance + invoicing fixture: flow counts, utilisation
  exclusion rule, delay coverage without a rate, fleet/expiry/maintenance, financial
  reconciliation and window semantics, scope enforcement and company isolation, export content).
  Fedora run pending.
- **Remaining Phase 1C scope:** PAX-01 passenger portal, RNT-09 rental customer portal, role
  dashboards and the hardening pass, per `richie-tms-phase-prompts.md`.

## Phase 1C — passenger portal (PAX-01; D-065; 2026-10-21)

Fourth Phase 1C slice, built under the owner's Phase 1C go-ahead. D-065 is recorded in
`docs/DECISIONS.md` for ratification at the Phase 1C gate.

- **Identity (migration `20261021120000_passenger_portal`, 24 total):** `Employee.userId` unique
  nullable link; `linkPassengerAccount`/`unlinkPassengerAccount` audited, manager-only
  (`employee:manage` GLOBAL/COMPANY), login must be ACTIVE with a PASSENGER assignment; the
  employee editor gained a "Passenger portal login" section listing unlinked passenger logins.
- **Portal (`/passenger`, `src/modules/passenger/`):** every read/action resolves the caller via
  the link only. Own-profile projection (no home address/accessibility/notes), arrangements
  (active contracts + client routes as approved options), upcoming/history journeys with the
  passenger status vocabulary (Requested, Confirmed, Assigned to trip, Driver en route, Delayed,
  Picked up, Completed, Cancelled) mapped by a pure, unit-tested function. Pickup time/location,
  trip reference and vehicle registration shown; no live map/ETA (PAX-02 is Phase 2).
- **Actions:** journey requests go through the extracted booking creation core (eligibility,
  duplicate journey, contract policy, creation cut-off all apply; the employee is always the
  linked record — `createBookingForLinkedEmployee`); cancellation is allowed only while
  Pending/Accepted, after which the portal directs the passenger to operations; feedback is an
  append-only `PassengerFeedback` row (optional 1–5 rating, required comment, DB trigger +
  rating CHECK), once per booking, Completed journeys only.
- **Tests:** unit `journey-status.test.ts`; integration `passenger.integration.test.ts` (5 tests:
  link rules incl. role gate and unlink/re-link, unlinked/cross-company denial, request rules
  incl. duplicate/past-date/eligibility, cancel ownership and assignment guard, full
  dispatch-to-completion status progression with one-time feedback). Sandbox PGlite proof: 24/24
  migrations, unique link index, append-only trigger and rating CHECK verified. Fedora run pending.
- **Remaining Phase 1C scope:** role-specific dashboards and the hardening pass, per
  `richie-tms-phase-prompts.md`.

## Phase 1C — rental customer portal (RNT-09; D-066; 2026-10-21)

Fifth Phase 1C slice. D-066 recorded in `docs/DECISIONS.md` for gate ratification.

- **Identity (migration `20261021130000_rental_customer_portal`, 25 total):** `Customer.userId`
  unique link, governed exactly like the passenger link (`customer:manage` GLOBAL/COMPANY, ACTIVE
  login with a `RENTAL_CUSTOMER` assignment, one-to-one, audited); the customer editor gained a
  "Rental customer portal login" section listing unlinked rental-customer logins.
- **Portal (`/rentals/portal`, `src/modules/rental-portal/`):** profile projection (own contact and
  billing details; internal notes never shown), own requests with actions, and explicit
  no-quotation-issued / no-payment-due states — internal pricing worksheets are not quotations and
  are never exposed.
- **Actions:** enquiry creation, Draft editing and submission run through the rental-request
  service cores (customer forced to the linked record, source forced `APP`, submission
  prerequisites identical to staff); withdrawal is new (own Draft/Submitted → `Cancelled`, with
  the DB status CHECK, history CHECK and transition guard extended by exactly those two pairs;
  the staff transition table is unchanged, so staff still cannot cancel).
- **Tests:** integration `portal.integration.test.ts` (4 tests: link rules, unlinked/cross-company
  denial, lifecycle incl. incomplete-submission refusal and withdrawal, review-state protection
  and cross-customer isolation). Sandbox PGlite proof: 25/25 migrations, unique link index,
  Draft→Cancelled allowed with history, unapproved transitions still refused. Fedora run pending.
- **Remaining Phase 1C scope:** role-specific dashboards and the hardening pass, per
  `richie-tms-phase-prompts.md`.

## Phase 1C — role-specific dashboards (D-067; 2026-10-21)

Sixth Phase 1C slice. D-067 recorded in `docs/DECISIONS.md` for gate ratification.

- Role dashboards already existed for drivers, dispatchers, corporate HR, finance, passengers
  and rental customers. The gap — an Operations Manager landing page — is now `/operations`
  (`src/modules/operations/dashboard.ts`), linked from the workspace for trip managers.
- Read-only snapshot, `trip:dispatch` or `booking:manage` at GLOBAL/COMPANY scope: today's trips
  (Africa/Accra) by status with vehicle/driver resourcing flags and assigned-passenger counts,
  the pending-booking decision queue, accepted-but-unassigned bookings (oldest/next first,
  totals labelled), active vehicle safety blocks, and driver/vehicle documents expired or
  expiring within 30 days. Every figure is a direct count over governed records; nothing is
  estimated.
- Tests: unit `dashboard.test.ts` (status bucketing, Accra date, day arithmetic) and integration
  `dashboard.integration.test.ts` (permission denial, snapshot correctness incl. unresourced
  detection and the 30-day licence window). Fedora run pending.
- **Remaining Phase 1C scope:** the hardening pass, then the Phase 1C gate (the MVP gate — Phase 2
  does not start until it is approved), per `richie-tms-phase-prompts.md`.

## Phase 1C — hardening pass and gate readiness (2026-10-21)

Final Phase 1C construction item. `docs/PHASE_1C_HARDENING.md` records the full review.

- **Fixed:** spreadsheet formula injection in CSV exports (reports + employee register now
  share `src/lib/csv-cell.ts`, unit-tested); `P2002` uniqueness races in account linking and
  passenger feedback now return domain errors instead of 500s; portal list caps (50/100) are
  labelled with totals; the operations dashboard column is honestly labelled "Bookings
  assigned"; rental-portal API 500s now log server-side.
- **Reviewed clean:** cross-company/cross-customer isolation of every Phase 1C surface,
  financial derivation rules, the shared booking creation core, responsive/accessibility
  patterns, and route error mapping.
- **Unit suite:** 396/396 in the sandbox (was 393 before the CSV cell tests).
- **Gate readiness:** Phase 1C construction is complete. What remains is owner-side: run
  `./scripts/verify-phase1c.sh` on Fedora (25 migrations, all integration suites), work
  through the manual browser checks in `docs/PHASE_1C_VERIFICATION.md`, ratify or amend
  D-061–D-067, and declare the Phase 1C (MVP) gate. Phase 2 must not start before that
  approval.

## Phase 2 — opening and in-app notifications (NTF-01; D-068; 2026-10-21)

Phase 2 opened by owner direction ("Start Phase 2 now", D-068). Phase 1C Fedora
verification and D-061–D-067 ratification remain outstanding in parallel and are not
recorded as passed.

- **Notification service (`src/modules/notifications/`):** one `Notification` per
  recipient login and channel (migration `20261021140000_notifications`, 26 total), with
  delivery status, `(company, recipient, channel, dedupeKey)` uniqueness so duplicate
  events never double-notify, and read tracking. Emission happens inside the governed
  event transaction (atomic; in-app "delivered" means stored in the inbox). Users are
  never notified about their own actions. `NotificationPreference` stores in-app/SMS/
  email switches (defaults on); the in-app switch is enforced now, SMS/email switches
  are stored for NTF-02/03.
- **Wired events:** booking created, booking status changed, booking assigned to a trip
  (linked passenger); rental request status changes (linked customer). Wording comes
  from a code-side template registry (admin-editable templates deferred, not claimed).
- **Inbox:** `/notifications` page, workspace bell with unread count, mark-read /
  mark-all-read, preference form. Inbox access is own-login only — no new permission
  vocabulary.
- **Tests:** template unit suite (4 tests; workspace bell assertion added to
  `page.test.tsx`) and `notifications.integration.test.ts` (5 tests: lifecycle
  emission with actor suppression, dedupe, preference switch, owner-only read marking,
  rental customer emission). Sandbox PGlite proof: 26/26 migrations, dedupe index,
  channel CHECK, preference defaults. Fedora run pending (`scripts/verify-phase2.sh`).
- **Next Phase 2 slices:** NTF-02 SMS adapter, NTF-03 email adapter, then incidents and
  breakdown workflow, boarding verification, driver offline queue,
  preventive-maintenance reminders, two-factor authentication.

## Phase 2 — SMS adapter (NTF-02; D-069; 2026-10-21)

Second Phase 2 slice. D-069 recorded in `docs/DECISIONS.md` for gate ratification.

- **Fan-out:** booking/rental notifications now also queue an SMS copy (own dedupe key,
  status `PENDING`, destination = the linked employee/customer telephone) whenever the
  recipient's SMS preference is on and a telephone is recorded; no telephone → no SMS row.
- **Provider:** `SmsProvider` interface (`src/modules/notifications/sms.ts`) with one
  Arkesel-v2-shaped adapter, activated only by `SMS_PROVIDER=arkesel` +
  `ARKESEL_API_KEY` + `ARKESEL_SENDER_ID`. Otherwise the feature is honestly
  **Not configured** (shown on the Notifications page) and dispatch is a no-op that
  reports exactly that. Vendor pricing/account verification remains an owner task.
- **Delivery truthfulness:** dispatch (Super-Admin endpoint
  `POST /api/notifications/sms/dispatch`, or any external scheduler calling the service)
  moves rows to `SENT` with attempts/backoff (max 3); only the secret-checked webhook
  `POST /api/notifications/sms/dlr` (`SMS_WEBHOOK_SECRET`) may mark `DELIVERED`.
  Users see their own SMS states in the inbox ("Waiting to send" / "Sent — awaiting
  delivery confirmation" / "Delivered" / failed with attempts).
- **Tests:** unit `sms.test.ts` (configuration detection, adapter request/response
  handling with stubbed fetch) and `sms.integration.test.ts` (fan-out, unconfigured
  dispatch no-op, SENT→DELIVERED only via confirmation, failure backoff and
  exhaustion, preference-off suppression). Fedora run pending.
- **Next:** NTF-03 email adapter, then incidents/breakdown, boarding verification,
  driver offline queue, maintenance reminders, two-factor authentication.

## Phase 2 — email adapter (NTF-03; D-070; 2026-10-21)

Third Phase 2 slice. D-070 recorded in `docs/DECISIONS.md` for gate ratification.
No new migration: the `Notification` channel CHECK already reserved `EMAIL`.

- **Fan-out:** the same booking/rental events now queue a `PENDING` email copy to the
  recipient's **login email** (own dedupe key), gated by their email preference.
- **Provider:** `EmailProvider` interface (`src/modules/notifications/email.ts`) with one
  SMTP adapter (nodemailer), activated only by `EMAIL_PROVIDER=smtp` with `SMTP_HOST`/
  `SMTP_FROM` (auth via `SMTP_USER`/`SMTP_PASSWORD`, `SMTP_SECURE`); otherwise honestly
  **Not configured** on the Notifications page and dispatch is a reporting no-op.
- **Truthful states:** success marks `SENT` ("Sent to mail server") — email has no
  delivery-report channel, so `DELIVERED` is never claimed. Failures use the SMS
  attempts/backoff discipline (max 3). Dispatch: Super-Admin
  `POST /api/notifications/email/dispatch`.
- **Tests:** unit `email.test.ts` (configuration, adapter handover/failure) and
  `email.integration.test.ts` (fan-out to the login address, unconfigured no-op,
  SENT-not-DELIVERED, failure backoff, preference-off suppression). Fedora run pending.
- **Next:** incidents and breakdown workflow (INC-01/02), boarding verification,
  driver offline queue, preventive-maintenance reminders, two-factor authentication.

## Phase 2 — incident records (INC-01; D-071; 2026-10-21)

Fourth Phase 2 slice; the breakdown *response* flow (INC-02) follows on this
foundation. Migration 28 (`20261021160000_incidents`).

- **Governed records:** `Incident` + sequenced `IncidentStatusHistory` with the house
  DB guards (status/type/severity CHECKs, transition guard function, deferred
  history-required trigger, append-only history). Lifecycle: Open → Acknowledged →
  In Progress → Resolved → Closed (reopen Resolved → In Progress); resolution
  requires notes. Types/severities per the standing brief.
- **Access:** incident handling reuses `trip:dispatch` GLOBAL/COMPANY; drivers report
  only against their own active trips through their linked driver identity.
- **Alerts:** creation notifies every company login holding `trip:dispatch` (in-app,
  with SMS/email fan-out where configured), never the reporter; the reporter is
  notified of later status changes.
- **Screens:** `/incidents` register + report form, `/incidents/[id]` detail
  (affected passengers, restricted people-affected note, status history,
  transition form), driver "Report a problem" form on **My trips**, home nav link.
- **Tests:** transition-matrix unit tests and `incidents.integration.test.ts`
  (driver report + alert fan-out, foreign-trip/unlinked refusals, lifecycle incl.
  notes-required/reopen/terminal rules, restricted detail, access denial).
  Sandbox: unit 412/412, PGlite 28/28 migrations with guard checks, build
  compiled. Fedora run pending.
- **Next:** INC-02 breakdown response (replacement suggestions and audited
  confirmation on active trips, optional safety block + work order, passenger
  notification), then boarding verification, driver offline queue,
  preventive-maintenance reminders, two-factor authentication.

## Phase 2 — breakdown response (INC-02; D-072; 2026-10-21)

Fifth Phase 2 slice; completes the brief's breakdown chain on top of INC-01.
No new migration.

- **Plan (`getIncidentResponsePlan`):** affected trips (the incident trip plus
  same-day active trips sharing its vehicle/driver) with passenger counts, and
  replacement options — vehicles not archived, not safety-blocked, not busy that
  day, flagged for passenger fit; drivers active, licence-valid, not busy. The
  current vehicle/driver are never offered as their own replacement.
- **Confirm (`confirmIncidentReplacement`):** one locked transaction — incident
  must be Open/Acknowledged/In Progress, trip active; archived or safety-blocked
  vehicles and inactive/licence-expired drivers refuse outright, day-overlap and
  seat shortfalls need `override` with a reason; the trip update, an
  `INCIDENT_REPLACEMENT_CONFIRMED` audit row (previous + new), and passenger
  notifications (NTF fan-out) commit together. Afterwards the optional safety
  block ("Out of Service") and work order run through the existing maintenance
  services; failures degrade to plain warnings, never silent.
- **Screens:** "Breakdown response" panel on the incident detail page with the
  confirmation form and honest result reporting.
- **Tests:** `incident-response.integration.test.ts` (suggestion eligibility,
  hard refusals, override path, clean replacement with block + work order +
  passenger alert + audit, resolved-incident refusal). Sandbox: unit 412/412,
  build compiled. Fedora run pending.
- **Next:** boarding verification (DRV-03), driver offline queue (DRV-05),
  preventive-maintenance reminders (MNT-03), two-factor authentication (AUTH-06).

## Phase 2 — boarding verification (DRV-03; D-073; 2026-10-21)

Sixth Phase 2 slice. Migration 29 (`20261021170000_boarding_verification`).

- **Codes:** `BookingBoardingCode` — six digits from `crypto.randomInt`, issued
  at trip assignment (regenerated on reassignment), expiring at the end of the
  trip day, consumed on first successful use (DB CHECK enforces the 6-digit
  shape). The passenger sees only their own code in **My journeys**; the driver
  manifest never carries codes.
- **Policy:** typed setting `trips.boarding_code_policy` = `{"mode": "DISABLED"
  | "REQUIRED"}` (validated in the settings registry). Unset deliberately keeps
  DRV-02 tap-to-board so upgrades never break boarding (recorded in D-073).
- **Enforcement:** inside the idempotent `BOARD` driver event — a supplied code
  is always checked; under `REQUIRED`, boarding needs a valid code or a manual
  reason (≥ 8 chars). Every attempt lands in `BoardingVerificationAttempt`
  (method/result/reason); failed attempts are recorded after the boarding
  transaction rolls back so results are never lost.
- **Tests:** `driver/boarding.integration.test.ts` (issue + passenger-only
  visibility, wrong-code refusal + recording, single-use consumption,
  manual-reason gate, expiry, DISABLED fallback). Sandbox: unit 412/412,
  PGlite 29/29 migrations + code-shape check, build compiled. Fedora pending.
- **Next:** driver offline queue (DRV-05), preventive-maintenance reminders
  (MNT-03), two-factor authentication (AUTH-06).

## Phase 2 — driver offline queue (DRV-05; D-074; 2026-10-21)

Seventh Phase 2 slice. No new migration, no service worker.

- **Scope (defined exactly):** only the eight driver trip events queue
  offline — they already flow through the idempotent `postDriverEvent`.
  Everything else (incident reports included) still requires connectivity.
- **Client:** `src/app/driver/offline-queue.ts` (storage-injected, unit-tested)
  + `DriverSyncPanel` on the driver page. Network-layer failures enqueue with
  the one-time key; server validation answers surface immediately and are
  never queued. Sync runs on page load, on `online`, and on demand, replaying
  in order; 200-duplicate clears like a fresh confirmation, 409/400 park the
  entry with the server's message until dismissed; a fresh network failure
  stops the replay and keeps the remainder pending.
- **Identity honesty:** entries carry no credentials — at sync, the server
  applies events under the signed-in driver and enforces trip ownership.
- **Tests:** `offline-queue.test.ts` (storage resilience, single-enqueue,
  ordered flush, duplicate clearing, offline stop, conflict parking).
  Sandbox: build compiled. Fedora run pending (browser workflow above).
- **Next:** preventive-maintenance reminders (MNT-03), two-factor
  authentication (AUTH-06), then the Phase 2 gate.

## Phase 2 — preventive maintenance reminders (MNT-03; D-075; 2026-10-21)

Eighth Phase 2 slice. Migration 30 (`20261021180000_service_plans`).

- **Plans:** `VehicleServicePlan` — calendar (days) and/or mileage (km)
  interval plus last-service baseline; saving requires at least one interval
  (schema refine; positive-value CHECKs in the DB) and refreshes the vehicle's
  stored `nextServiceAt` so the fleet register agrees.
- **Computed reminders:** OVERDUE / DUE_SOON (≤14 days or ≤500 km) / OK from
  the baseline and the current odometer; plan-less vehicles with a stored
  next-service date still appear. State is computed on read — **a passed date
  never marks maintenance complete**; only the audited
  `VEHICLE_SERVICE_RECORDED` action moves the baseline.
- **Screens:** `/fleet/maintenance/service-plans` register + plan/record
  forms + "Notify fleet team" (alerts `maintenance:manage` holders, dedupe
  per vehicle + due date + severity; no scheduler pretended).
- **Tests:** computation unit tests (calendar/mileage/stored-date/NO_PLAN)
  and `service-plans.integration.test.ts` (interval requirement, access,
  overdue computation + nextServiceAt sync, one-alert-per-cycle dedupe,
  record-service baseline move, foreign-vehicle refusal). Sandbox: unit
  422/422, PGlite 30/30. Fedora run pending.
- **Next:** two-factor authentication (AUTH-06), GPS provider state (GPS-01),
  then the Phase 2 gate.

## Phase 2 — two-factor authentication (AUTH-06; D-076; 2026-10-21)

Ninth Phase 2 slice. Migration 31 (`20261021190000_two_factor`).

- **Mechanism:** the auth library's two-factor plugin — TOTP authenticator
  apps plus one-time backup codes, secrets encrypted under `AUTH_SECRET`,
  verification rate-limited (plugin + explicit rate-limit rules). Any user
  may enrol at `/account/security`; sign-in with 2FA on detours through
  `/login/verify` before any session exists.
- **Privileged requirement:** global Super Administrators must enrol —
  enforced by routing after sign-in and at the workspace home
  (`getTwoFactorGate`). D-076 records the known limitation: without
  database-capable middleware on this Next.js version, deliberate deep-link
  bypass is not hard-blocked; framework upgrade is the follow-up.
- **Tests:** `server/auth.test.ts` (plugin registered + verify endpoints
  rate-limited), `auth/two-factor-gate.integration.test.ts` (only global
  Super Admins gated; gate clears once enabled). Sandbox: unit 422 + 1 new,
  PGlite 31/31, build compiled. Fedora run pending.
- **Next:** GPS-01 provider state, then the Phase 2 verification checkpoint.

## Phase 2 — GPS provider interface (GPS-01; D-077; 2026-10-21)

Tenth and final Phase 2 construction slice. Migration 32
(`20261021200000_vehicle_locations`).

- **Honest default:** with no `GPS_PROVIDER`/`GPS_WEBHOOK_SECRET` configured,
  **Vehicle locations** says *Not configured* and shows nothing invented. The
  first adapter is a documented generic JSON webhook (shared-secret header),
  behind the `GpsProvider` interface any vendor/phone app can target.
- **Rules from the brief:** reports are accepted **only while the vehicle is
  on an active trip** (authorised operational periods) and are stamped with
  that trip; every position carries its source and is classified **live
  (≤5 min) / stale / simulated**; history is restricted to fleet/trip
  managers, append-only (DB trigger), retained 90 days via an explicit
  audited purge; drivers see a consent notice in the driver view.
- **Tests:** `gps.test.ts` (adapter normalisation, coordinate refusal,
  configuration detection, freshness) and `gps.integration.test.ts`
  (unconfigured/wrong-secret refusals, off-trip refusal, live + simulated
  intake, append-only history vs purge). Sandbox: unit 427/427, PGlite 32/32
  migrations with trigger/purge checks, build compiled. Fedora run pending.
- **Phase 2 construction is complete.** Remaining before the gate: the Fedora
  run (`./scripts/verify-phase2.sh` + the manual workflows in
  `docs/PHASE_2_VERIFICATION.md`), then ratification of D-068–D-077.

## Fedora verification findings — fix round (2026-10-21)

First Fedora run of `verify-phase2.sh` (commit `5610bb3`): steps 1–6 passed
(32/32 migrations, typecheck, lint 0 errors, unit 427/427). Integration:
154 passed, 9 failed, 7 skipped — four root causes, all fixed here:

1. **Wrong permission name (6 failures, INC-01/02):** incidents (and the
   operations dashboard's trip leg and the GPS trip leg) checked a
   `trip:manage` permission that does not exist in the seeded grants; the
   real vocabulary is `trip:dispatch` (SUPER_ADMIN GLOBAL, OPS_MANAGER /
   DISPATCHER COMPANY). Fixed in code and in D-067/D-071 records.
2. **Reports suite setup (7 skipped):** the RPT fixture created a `Route`
   without the required `operatingDays` — fixture now supplies it.
3. **Passenger home classification (1 failure, PAX-01):** a completed
   journey with a future date landed in *upcoming* instead of *history*;
   `Completed` now classifies as history in both lists and counts.
4. **Portal error leak (1 failure, RNT-09):** editing/submitting another
   customer's request surfaced the staff `RentalRequestNotFoundError`; the
   portal now maps it to `RentalPortalRequestNotFoundError` so it never
   confirms another customer's request exists.

Expected on re-run: 0 failures, 0 skipped in these suites. Integration
remains Fedora-verified only — the sandbox has no PostgreSQL engine.

## Phase 2 Fedora verification PASSED — automated gate (2026-10-21)

`./scripts/verify-phase2.sh` is fully green at commit `a438d89` on Fedora
(DB `richie_tms_p2_20261021180752_test`): 32/32 migrations applied,
typecheck clean, lint 0 errors (4 warnings), unit 427/427, integration
**170 passed / 0 failed / 0 skipped** (40 suites). All Phase 2 integration
suites pass on real PostgreSQL: notifications, SMS, email, incidents,
incident response, boarding codes, service plans, two-factor gate, GPS —
plus reports (RPT-02/03/04) 7/7, first run green after fixture repairs.

Getting there took four fix rounds, all in fixtures or the defects they
exposed (never weakened product rules): permission vocabulary
(`trip:dispatch`, not `trip:manage`); passenger completed-journey
classification; rental portal not-found error mapping; and layered
reports-fixture repairs — required `operatingDays`, `WO-[A-F0-9]{16}`
reference format, non-safety intake (D-058), and seeding work orders
through the governed lifecycle so the status-history trigger and
approval segregation are honoured.

The script ends pointing at the remaining gate items: the manual browser
workflows and E2E in `docs/PHASE_2_VERIFICATION.md`, owner ratification
of D-068–D-077, and the still-outstanding Phase 1C Fedora run
(`./scripts/verify-phase1c.sh`, expects 25 migrations).

## D-061–D-077 ratified (2026-10-21, D-078)

Owner approved the one-page sign-off (`docs/SIGN_OFF_D061_D077.md`) in
full, with the recommended policy values: on-time pickup threshold
**10 minutes**, revenue-by-service keeps the free-text contract field,
invoice due dates + ageing deferred as a recorded future requirement,
and the D-076 2FA enforcement limitation accepted. The threshold is now
wired (`c87fe14`): RPT-02 reads the typed `reports.on_time_threshold`
setting and publishes the on-time rate once 10 is entered in Settings;
unit 428/428 in the sandbox, with an integration test for the
published-rate path awaiting the next Fedora run. Remaining gate items:
`./scripts/verify-phase1c.sh`, both manual checklists, and entering the
threshold value in Settings.

## UI interaction pilot (2026-10-21, D-079)

beUI-inspired patterns in the house design system (no new dependency):
OTP-style boarding-code input with rejection shake; driver toast stack
reporting event and sync outcomes; status-history timeline wired into
work-order audit history. Sandbox: typecheck + lint clean, unit 436/436
(8 new component tests), production build compiled. Manual feel-check
rides along with the outstanding Phase 1C/2 manual checklists. Recorded
finding: Tailwind is installed but unwired (utilities inert) — owner
decision in D-079.

## Route conflict fix (2026-10-21)

`npm run dev` refused to start: the GPS history route
(`locations/[vehicleId]/history`) collided with the places register's
`locations/[locationId]` — Next.js forbids sibling dynamic segments
with different names (introduced by GPS-01; typecheck and the test
scripts never see it, only dev/build route collection does). The GPS
history now lives under a static segment:
`locations/vehicles/[vehicleId]/history`. The fleet locations page
uses services directly, so nothing else moved. Verified: typecheck
clean and `next dev` reaches Ready.

## Super-admin password reset CLI (2026-10-21)

Owner lockout during manual-verification setup (a password mistyped
into a hidden prompt cannot be recovered, and bootstrap is one-time).
Added `npm run reset:super-admin-password -- --confirm`
(`scripts/reset-super-admin-password.ts`): interactive-TTY only,
resets only an existing global Super Administrator's credential,
revokes their sessions, and writes a `SUPER_ADMIN_PASSWORD_RESET`
audit event. Documented in `docs/SETUP_AND_DEPLOYMENT.md` step 9 with
the same handling cautions as the bootstrap command.

## Manual-verification environment live (2026-10-21)

Fresh browser environment established on Fedora for the Phase 1C/2
manual checklists: disposable database `richie_tms_app_p2_test`
(32/32 migrations), Super Administrator and Richie Transport Services
bootstrapped, dev app pointed at it via `.env`. Browser sign-in and the
AUTH-06 super-admin 2FA gate (redirect to `/account/security?required=1`)
exercised successfully at HEAD `61a95a2`. Two environment lessons
recorded: a shell that once exported a stale `DATABASE_URL` overrides
`.env` for every later `npm run dev` in that terminal (use a fresh
shell); and long-lived dev servers accumulate stale `.next` state
across pulls — `rm -rf .next` + restart before suspecting the code.

## 2FA requirement suspended (2026-10-21, D-080)

Owner direction: no role is required to enrol in 2FA for now. The gate
reports `required/mustEnroll: false`; enrolment remains available at
`/account/security`, and enrolled accounts keep their sign-in
challenge until they switch it off there. Integration test updated to
the suspended behaviour (Fedora re-run pending). Reinstatement is the
one-line `required` restoration recorded in D-080.
