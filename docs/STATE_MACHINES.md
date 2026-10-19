# State machines — approved and proposed tables

Approval is tracked per entity: the vehicle status vocabulary and safety/derivation principles are owner-approved in D-016; detailed vehicle transitions and most other entity transitions remain proposed. D-021/D-022/D-023/D-030 approve rental-request Draft entry and Draft → Submitted, including an explicit return date for overnight return-time requests. D-029 defines reservation triggers but does not approve the Confirmed/Assigned transitions themselves. D-031 defines fail-closed buffer and release effects but approves no status transitions. `*` means any nonterminal state. Any implemented change must be service-authorized, enforce preconditions, and preserve status history/audit evidence. No vehicle status transition implementation exists yet.

| Entity | From → To | Actor | Preconditions |
|---|---|---|---|
| Rental request | Draft → Submitted | Ops Manager/Super Administrator | D-023: customer, service date, departure time, pickup, destination, positive passenger count, request source, and either return time or duration in positive whole minutes; D-030: if return time is earlier than departure, require an explicit return date after service date; audited reason and status-history entry |
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

**D-021/D-022/D-023/D-030 approved rental-request boundary:** staff enquiries are initially saved as Draft; submission is separate. Drafts may omit both return time and duration; before submission at least one is required, with duration measured in positive whole minutes. A request links to an existing customer. If return time is earlier than departure, an explicit return date after service date is required before submission; never infer the next day. D-023/D-030 approve only Draft → Submitted, its required fields, and Ops Manager/Super Administrator authority. D-029 defines future reservation triggers but does not approve the Confirmed/Assigned transitions. D-031 requires explicit company-configured vehicle/driver buffers and prevents release by scheduled time alone; release effects require actual authorized cancellation/completion/return/assignment-end transitions, none of which are implemented or approved here. Every later transition in the proposed table remains unapproved and unimplemented.

Actor names are roles, not a substitute for resource/action permission checks. Management must approve the full from-to matrices and ambiguous transitions before implementation. Terminal states cannot be changed without explicit audited exceptional transition and reason.
