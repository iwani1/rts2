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
- Document types, expiry reminder lead times, service intervals, retention periods.
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
- Named approvers for financial approvals; who can release safety-blocked vehicles and whether inspector must differ from technician. Finance quotation approval remains gated on a specific delegated-approval policy.
- Vehicle status transitions: permitted actors and transition-specific preconditions; how to handle active assignments when a safety-blocking status is applied; maintenance/inspection release authority. The seven status names and safety-blocking principle are approved in D-016. Assignment active statuses, time buffers between jobs, and conflict horizon also remain open.
- Booking cutoff, duplicate-journey identity, capacity/waitlist and no-show rules.
- Exact shift/route recurrence and local-time behavior; contract approval, suspension and renewal rules.
- Corporate billing frequency and payment terms; chargeable trip definition and duplicate-billing event key.
- Invoice numbering, credit note/adjustment and accounting periods.
- Incident severity/escalation, retention and passenger notification rules.
- Data subject request contact, lawful bases, retention schedule by record class, DPC registration status and privacy owner.
- Production notification providers, maps/GPS hardware, SMS/e-mail/payment credentials and verification test arrangements.

Until resolved, settings remain unset and dependent actions must be blocked with clear explanation.
