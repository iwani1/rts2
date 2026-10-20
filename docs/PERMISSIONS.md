# Owner-approved role and permission matrix

**Owner-approved (2026-10-18).** Legend: `C` company-scoped; `Own` own-record only; `—` denied. Deny-by-default; all checks occur in services. Super Administrator access is audited. Corporate users are confined to their own company; rental customers to owned records; drivers to assigned trips.

| Resource:action | Super Admin | Ops Mgr | Dispatcher | Fleet Mgr | Corp HR | Driver | Passenger | Rental Customer | Finance | Technician |
|---|---|---|---|---|---|---|---|---|---|---|
| user:manage | C | C (nonprivileged) | — | — | own-company users | — | — | — | — | — |
| settings:read | C | C | dispatch-only | fleet-only | own policy | — | own policy | — | finance-only | — |
| settings:write | C | limited operational | — | fleet-only | — | — | — | — | finance-only | — |
| audit:read | C | operational subset | — | fleet subset | — | — | — | — | finance subset | — |
| customer:manage | C | C | enquiry context | — | — | — | — | own profile | billing context | — |
| rental:manage | C | C | C | availability only | — | assigned execution | — | Own create/read/respond | invoice context | — |
| quotation:approve | C | C | — | — | — | — | — | Own accept/decline | C approve per delegated policy | — |
| fleet:manage | C | C | read/assign subset | C | — | own assigned vehicle read | — | — | cost read | maintenance subset |
| driver:manage | C | C | read/assign subset | C | — | own profile | — | — | — | — |
| maintenance:manage | C | C | read availability | C approve/release | — | report defect | — | — | cost read | work order update, no safety release |
| client:manage | C | C | read dispatch context | — | own client read | — | — | — | billing context | — |
| employee:manage | C | C | roster minimum | — | own client C | assigned manifest minimum | own profile | — | — | — |
| booking:manage | C | C | C | — | own client C | assigned trip event only | Own where enabled | — | billing read | — |
| route:manage | C | C | C | — | own client read | assigned trip read | own booking read | — | — | — |
| trip:dispatch | C | C | C | read fleet view | own client read | Own assigned trip events | Own trip status | own rental status | read billing link | — |
| incident:manage | C | C | C | fleet incidents | own client summary | own report | affected status minimum | — | — | report/update assigned |
| invoice:manage | C | read | — | — | own client read | — | own invoice read | own invoice read | C | — |
| payment:record | C | — | — | — | — | — | — | — | C | — |
| report:export | C | C operational | dispatch scope | fleet scope | own client data | — | own data | own data | finance scope | — |

Company-scoped permissions are always additionally restricted to assigned `company_id`. “Own” requires subject ownership and limited field projection, not merely filtering in UI. HR home addresses/accessibility information and incident personal data have separate restricted-field policy. `DELEGATED_APPROVAL` is fail-closed: the resolver denies it unconditionally until the owner defines a delegated approval policy and a domain service enforces it; Finance quotation approval is currently unavailable. User role assignment must not permit self-escalation; elevated changes require authorized actor and audit event. Where a cell names a restricted subset (for example “read/assign subset” or “own trip status”), the domain service must apply that constraint in its repository query; a broad permission check alone is insufficient. The first Super Administrator will be provisioned by a one-time, local, audited CLI command that refuses to run if a Super Administrator already exists; public self-registration remains disabled.
