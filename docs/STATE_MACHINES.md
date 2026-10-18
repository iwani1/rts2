# State machines — proposed Phase 0 tables

Transition tables below are proposals inferred from feature requirements. Management must confirm business rules. `*` means any nonterminal state; all changes require service permission, preconditions, reason where stated, and append-only status history. No transition implementation exists yet.

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
| Vehicle | Available ↔ Reserved/Assigned/On Trip | service/dispatcher | valid non-overlap assignment |
| | Available/Reserved/Assigned → Pending Inspection/Under Maintenance/Out of Service | fleet/technician | maintenance/defect record; assignments safely handled |
| | Under Maintenance → Pending Inspection → Available | authorized inspector/releaser | completed work and recorded inspection; technician cannot self-release where prohibited |
| | Out of Service → Pending Inspection → Available | authorized manager | defect clearance and approval |
| | * → Retired | fleet manager | no active assignment; archive only |
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

Actor names are roles, not a substitute for resource/action permission checks. Management must approve the full from-to matrices and ambiguous transitions before implementation. Terminal states cannot be changed without explicit audited exceptional transition and reason.
