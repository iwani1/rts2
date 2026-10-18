# State machines — approved and proposed tables

Approval is tracked per entity: the vehicle status vocabulary and safety/derivation principles are owner-approved in D-016; detailed vehicle transitions and the other entity tables remain proposed until their required workflows and business rules are confirmed. `*` means any nonterminal state. Any implemented change must be service-authorized, enforce preconditions, and preserve status history/audit evidence. No vehicle status transition implementation exists yet.

| Entity | From → To | Actor | Preconditions |
|---|---|---|---|
| Rental request | Draft → Submitted | staff/customer | required request fields; public spam/rate controls |
| | Submitted → Under Review | rental staff | request belongs to company |
| | Under Review → Awaiting Quotation | rental staff | review complete |
| | Under Review → Declined | authorized rental staff | reason |
| | Awaiting Quotation → Quotation Sent | quote approver | approved current quote and configured tax/deposit/validity |
| | Quotation Sent → Awaiting Customer Confirmation | service | delivered/sent quote record |
| | Awaiting Customer Confirmation → Confirmed | customer/staff | unexpired acceptance; availability, policy/deposit check; reservation transaction |
| | Confirmed → Dispatched → In Progress → Completed | dispatcher/driver/staff | assignment valid; completion details and final-charge review |
| | * → Cancelled | authorized actor/customer per policy | cancellation allowed; reason; release assignments |
| | Draft/Submitted/Under Review → Declined | authorized staff | reason |
| Quotation | Draft → Pending Approval → Approved → Issued | preparer/approver | settings complete; arithmetic validated; approver distinct if required |
| | Issued → Accepted | customer/staff | before valid-until; request still eligible and availability rechecked |
| | Issued → Rejected/Expired | customer/system | explicit response / validity passed |
| | Approved/Issued → Superseded | authorized staff | new version, preserve history |
| Booking | Draft → Pending → Accepted/Rejected | employee/HR/service | eligibility, contract policy, capacity and duplicate checks |
| | Accepted → Assigned → Boarded → Completed | dispatcher/driver | trip assignment/capacity; event idempotency |
| | Pending/Accepted/Assigned → Cancelled | employee/HR/authorized staff | cancellation rules and reason; release capacity |
| Trip | Planned → Ready for Dispatch → Dispatched → In Progress → Completed | dispatcher/driver | assignment and readiness checks; actuals on completion |
| | Planned/Ready → Cancelled | dispatcher/manager | reason; no forbidden started state |
| | Dispatched/In Progress → Delayed/Interrupted → In Progress/Completed | dispatcher/driver/manager | reason; incident as needed |
| | Interrupted → Cancelled/Completed | manager | resolution and reason |
| Vehicle | Reserved, Assigned, On Trip | system, through future reservation/assignment/trip modules | derive from authoritative linked records; not manual status choices |
| | Available | not implemented; no manual edit or default | rules for deriving/entering Available remain to be specified |
| | Under Maintenance, Out of Service, Pending Inspection | Ops/Fleet Manager or Super Administrator may apply; Fleet Manager/authorized releaser approves return; separate inspector role not required | apply safety block immediately and prevent new assignments; flag future assignments for dispatcher resolution without auto-cancelling/reassigning; active trips use incident/replacement workflow; return to Available only after work completion, inspection record, and release approval |
| Work order | Reported → Awaiting Inspection → Approved → In Progress → Awaiting Parts/In Progress → Awaiting Review → Completed → Closed | technician/manager/reviewer | assigned work; safety status; costs/inspection supplied; approval separation as policy requires |
| | Reported/Awaiting Inspection → Closed/Cancelled | authorized manager | reason and no unsafe release |
| Contract | Draft → Pending Approval → Active | preparer/approver | dates, client and agreed terms; approval |
| | Active → Suspended/Expired/Terminated | authorized manager/system | policy, effective date, reason; termination approval |
| | Suspended → Active | authorized approver | conditions met; decision recorded |
| | Expired → Active | authorized approver | renewal/amendment approved, never silently reactivate |
| Invoice | Draft → Pending Approval → Issued → Partially Paid → Paid | finance/approver/payment service | billable event unique; settings/totals valid; payment verified |
| | Draft/Pending Approval → Void | authorized finance/approver | reason; issued invoice corrected through credit/adjustment, not mutation |
| | Issued/Partially Paid → Overdue | scheduled process | due date passed, outstanding balance > 0 |
| Incident | Reported → Acknowledged → Investigating → Resolved → Closed | driver/dispatcher/manager | description and severity; affected parties access-controlled |
| | * → Escalated | dispatcher/manager | severity/response criteria configured; reason |
| | Resolved → Investigating | authorized manager | reopening reason |

**D-016 approved vehicle boundary:** use only the seven vehicle status names in the standing brief. Do not add `Retired`. New vehicle records receive no status default, and the current vehicle register must not expose manual status editing. Reserved/Assigned/On Trip will derive from authoritative related records.

**D-018 approved conflict/release policy:** apply a safety block immediately and prevent new assignments. Flag future assignments for dispatcher resolution without auto-cancelling or reassigning them; use the incident/replacement workflow for a vehicle already on a trip. A Fleet Manager/authorized releaser may return a vehicle to Available after work completion and an inspection record; a separate inspector role is not required. D-019 records who may apply safety blocks. Transition-specific preconditions remain open; these workflows are not implemented yet.

Actor names are roles, not a substitute for resource/action permission checks. Management must approve the full from-to matrices and ambiguous transitions before implementation. Terminal states cannot be changed without explicit audited exceptional transition and reason.
