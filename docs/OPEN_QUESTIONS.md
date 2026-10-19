# Open questions — management decisions required

No business defaults have been invented. Items marked **Phase 1A blocker** prevent dependent actions. The owner should answer and approve before the relevant feature is implemented.

## Business and hosting context (Phase 0 gate)
- Fleet count, categories, seats and ownership; driver count; current corporate clients and approximate staff numbers.
- Shift names/local start/end times; current operating process; role/user counts.
- Hosting provider/plan and confirmation of Node.js, PostgreSQL 15+, `btree_gist`, persistent jobs, WebSockets, backups, restore and storage support.
- Third-party-service budget; logo/brand colors/assets; existing-data files/formats.
- Website service descriptions and authorization/technical method for embedding rental enquiry.

## Explicit mandatory pricing and policy questions (Phase 1A blockers)
- Rental pricing basis and configured pricing models/line items; distance/time source and rounding.
- Deposit amount or percentage, payment requirement and when funds are considered received.
- Quotation validity duration; extension authority and process.
- Cancellation windows, fees, refund rules and resource-release timing by request/booking state.
- Are drivers always included? When can customer request self-drive, if ever?
- Who approves quotations, discounts, tax lines, deposits and additional charges?
- VAT registration and accountant-confirmed VAT/levy lines and rates; is GRA e-VAT required?
- Payment methods currently accepted, including cash, bank transfer, MTN MoMo, Telecel Cash, AT Money; verification/reconciliation process.
- Vehicle categories and capacity definitions; driver licence/qualification requirements.
- Driver status/availability vocabulary and allowed transitions; which operational driver fields Dispatchers may see; account-to-driver identity verification/linking; personal-data field justification and retention.
- **Driver CSV identity/duplicate policy (MIG-01):** resolved by D-025. Show warning-only possible-name matches within the CSV and against existing company driver records. Names are not proof of identity; every valid row remains importable and is created separately after confirmation, with no automatic skip, merge, update, blocking, or deduplication. No stable identifier has been approved or added.
- **Resolved 2026-10-18:** initial vehicle-document types are limited to Insurance, Roadworthiness, and Vehicle Registration. Production file-storage provider/hosting remains unselected. Expiry reminder lead times, recipients and delivery channel; service intervals; and document/file retention period remain unresolved. No uploads, automatic reminders, or automatic deletion until those decisions are made.
- On-time threshold and exact pickup performance definition.
- Boarding-code policy, validity and single-use requirement.
- Are bookings allowed under expired or suspended contracts?
- Rental quotation approval separation, customer acceptance evidence, and invoice due/payment terms.

## Phase 1A authentication/authorization blockers
- **Resolved 2026-10-18:** owner approved the `PERMISSIONS.md` matrix. First Super Administrator will use the one-time audited local CLI bootstrap; public self-registration stays disabled.
- **Resolved 2026-10-18:** this installation has one `Company` tenant, Richie Transport Services. Separate corporate customers remain customer/client records, not tenants. A one-time audited local CLI provisions the company record; no settings or operational records are seeded.
- What account invitation delivery channel and expiry/revocation policy should be used? Email is not configured.
- Password-reset delivery channel, account recovery verification, session revocation policy and login-history retention require approval.

## Other required policies
- **Resolved 2026-10-19 (D-020):** customer register requires a customer/display name; reference is optional, staff-entered and company-unique when supplied; type and status are optional free text without defaults or preset values. Customer type/status vocabulary and reference-generation policy are therefore intentionally not configured. Customer record retention, data-subject handling and privacy/legal policy remain open.
- **Resolved 2026-10-19 (D-021/D-022/D-023):** staff rental enquiries start as Draft; submission is separate; Drafts may omit return time and duration but submission requires at least one, with duration entered in positive whole minutes; requests link to an existing customer. Submission requires customer, date, departure time, pickup, destination, positive passenger count, source, and return time or duration, and may be performed by Ops Managers or Super Administrators. Remaining rental status transitions and their actors/preconditions are still open.
- **RNT-03 availability/conflict prevention remains partly deferred (D-026–D-031):** Draft and Submitted do not reserve resources. A vehicle is reserved at `Confirmed` with a specific vehicle selected; a driver is reserved when specifically `Assigned` to a `Confirmed` booking. The future conflict interval is departure to return, or departure plus duration minutes, interpreted in `Africa/Accra`; incomplete intervals cannot commit resources. D-030 approves overnight requests only with an explicit return date (no next-day inference). Vehicle and driver buffers must be explicitly set separately, with zero only when explicitly confirmed. Resolved by D-031: separate non-negative whole-minute vehicle and driver buffers, no defaults, and commitment blocked while the relevant value is unset; release only on accepted pre-trip cancellation or recorded actual completion/vehicle return (driver assignment end), never by scheduled time alone. Values are intentionally unset until entered with an audit reason. Reservation/confirmation/assignment/cancellation/completion/return/reassignment workflows remain unimplemented and their actors/preconditions remain unapproved.
- **Resolved 2026-10-19 (D-024):** CSV imports are all-or-nothing. Preview every row and show errors; write nothing until all rows are valid and the operator confirms the complete batch. Do not silently skip rows or merge/update existing records.
- Named approvers for financial approvals. Finance quotation approval remains gated on a specific delegated-approval policy.
- Vehicle status transitions: D-019 resolves the authority to apply safety blocks (Ops Managers, Fleet Managers, Super Administrators); Drivers/Technicians report defects and Dispatchers may view availability but cannot change status. D-016 approves the status names/safety boundary; D-018 approves immediate blocking, dispatcher resolution for future assignments without auto-cancellation/reassignment, incident/replacement workflow for an active trip, and Fleet Manager/authorized-releaser approval after work completion and an inspection record (no separate inspector role required). Transition-specific preconditions remain open, as do assignment active statuses, time buffers between jobs, and conflict horizon.
- Booking cutoff, duplicate-journey identity, capacity/waitlist and no-show rules.
- Exact shift/route recurrence and local-time behavior; contract approval, suspension and renewal rules.
- Corporate billing frequency and payment terms; chargeable trip definition and duplicate-billing event key.
- Invoice numbering, credit note/adjustment and accounting periods.
- Incident severity/escalation, retention and passenger notification rules.
- Data subject request contact, lawful bases, retention schedule by record class, DPC registration status and privacy owner.
- Production notification providers, maps/GPS hardware, SMS/e-mail/payment credentials and verification test arrangements.

Until resolved, settings remain unset and dependent actions must be blocked with clear explanation.
