# Data protection — initial assessment (Ghana, Act 843)

This is a product-design proposal, not legal advice. Richie Transport Services must confirm lawful purposes, controller/processor roles, notices, registration status and retention with its responsible privacy lead/counsel. The Data Protection Commission registration obligation is specifically an open management verification item; do not claim registration.

| Data | Purpose | Access proposal | Retention proposal |
|---|---|---|---|
| User identity, email, role, login history | account security and operations | user own profile; authorized admins; security events restricted | account lifetime plus approved security/audit schedule |
| Customer contacts, billing details, rental requests | enquiry, fulfillment and billing | rental team; customer own portal; finance minimum for billing | operational period plus legally required accounting period (duration to confirm) |
| Employee identity, work/shift/transport eligibility | contracted transport and booking | own employer HR; dispatch minimum manifest fields; employee own view | employment/contract purpose then approved deletion/de-identification schedule |
| Home address, phone, accessibility needs | pickup and accommodation | highly restricted HR/dispatch; only when necessary; no general reports | minimize; delete when no longer operationally/contractually required, subject to legal hold |
| Driver licence and qualifications | safety/eligibility | fleet/authorized operations; driver own record | active eligibility plus legally required record period (confirm) |
| Vehicle documents, maintenance and trip events | roadworthiness, safety and service | fleet/operations; limited finance costs | asset life and legal/insurance requirements (confirm) |
| Financial invoices, payment references and adjustments | accounting/reconciliation | finance and authorized approvers; customer own status | statutory accounting/tax retention period to confirm with accountant |
| Incident details, people affected, attachments | response, safety, claims | need-to-know incident responders, management; restricted personal data | claims/safety/legal schedule, case-specific; confirm |
| GPS data (not implemented) | operational safety only if authorized | restricted dispatch access during authorized periods | do not collect unless configured, notice/consent/legal basis approved; shortest useful retention |
| Audit events | accountability/security | restricted admin/auditor | approved security/accountability schedule |

## Safeguards and procedures
- Purpose limitation, minimum fields, role/tenant-scoped views, encryption in transit and managed encryption at rest, secure file access, audit of sensitive access, no personal data in routine logs.
- Provide notice, access/correction request workflow, complaints contact, retention holds, deletion/de-identification and breach response process before production.
- Restrict exports, record actor/reason, expire temporary files, never expose public object URLs for sensitive files.
- Confirm DPC registration obligations/status; maintain data inventory and processor agreements; conduct a privacy impact review for location tracking and accessibility/incident data.
- Retention durations are deliberately not fabricated. Management/accountant/legal counsel must set actual schedules before production use.
