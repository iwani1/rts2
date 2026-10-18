# Relational data model (target; Phase 0)

The following is the intended complete domain relationship map. Fields are abbreviated to keep the diagram legible; every tenant-owned entity carries `company_id` where applicable, with restrictive foreign keys and tenant-aware uniqueness. Global super-admin identity and system settings are exceptions. This diagram remains a target; auth/settings and the first Vehicle register schema are implemented in Prisma, but most shown domain entities do not yet exist.

```mermaid
erDiagram
  COMPANY ||--o{ USER_COMPANY_ROLE : grants
  USER ||--o{ USER_COMPANY_ROLE : assigned
  ROLE ||--o{ USER_COMPANY_ROLE : identifies
  USER ||--o{ AUDIT_EVENT : acts
  COMPANY ||--o{ SETTING : configures
  COMPANY ||--o{ CUSTOMER : serves
  CUSTOMER ||--o{ RENTAL_REQUEST : submits
  RENTAL_REQUEST ||--o{ QUOTATION : quoted
  QUOTATION ||--o{ QUOTATION_LINE : contains
  RENTAL_REQUEST ||--o| RENTAL_RESERVATION : confirms
  VEHICLE ||--o{ RESOURCE_ASSIGNMENT : assigned
  DRIVER ||--o{ RESOURCE_ASSIGNMENT : assigned
  RENTAL_RESERVATION ||--o{ RESOURCE_ASSIGNMENT : reserves
  COMPANY ||--o{ VEHICLE : owns
  COMPANY ||--o{ DRIVER : employs
  VEHICLE ||--o{ VEHICLE_DOCUMENT : documented
  VEHICLE ||--o{ WORK_ORDER : maintained
  WORK_ORDER ||--o{ WORK_ORDER_COST : costs
  COMPANY ||--o{ CORPORATE_CLIENT : contracts
  CORPORATE_CLIENT ||--o{ CONTRACT : holds
  CORPORATE_CLIENT ||--o{ EMPLOYEE : employs
  CONTRACT ||--o{ ROUTE : defines
  ROUTE ||--o{ ROUTE_STOP : orders
  ROUTE ||--o{ TRIP : schedules
  TRIP ||--o{ BOOKING : carries
  EMPLOYEE ||--o{ BOOKING : requests
  TRIP ||--o{ TRIP_STOP : visits
  TRIP ||--o{ RESOURCE_ASSIGNMENT : uses
  TRIP ||--o{ DRIVER_EVENT : records
  TRIP ||--o{ INCIDENT : affected
  COMPANY ||--o{ INVOICE : bills
  INVOICE ||--o{ INVOICE_LINE : contains
  INVOICE ||--o{ PAYMENT : receives
  USER ||--o{ STATUS_HISTORY : changes
  COMPANY ||--o{ STATUS_HISTORY : scopes
  COMPANY {
    uuid id PK
    text name
    text status
  }
  USER {
    uuid id PK
    text email UK
    text status
  }
  USER_COMPANY_ROLE {
    uuid user_id FK
    uuid company_id FK
    text role_id FK
  }
  ROLE {
    text id PK
    text name
  }
  CUSTOMER {
    uuid id PK
    uuid company_id FK
    text reference
    text type
  }
  RENTAL_REQUEST {
    uuid id PK
    uuid company_id FK
    uuid customer_id FK
    text status
    timestamptz starts_at
    timestamptz ends_at
  }
  QUOTATION {
    uuid id PK
    uuid request_id FK
    int version
    numeric total
    text status
  }
  VEHICLE {
    uuid id PK
    uuid company_id FK
    text registration
    int seats
    text status
  }
  DRIVER {
    uuid id PK
    uuid company_id FK
    text status
  }
  RESOURCE_ASSIGNMENT {
    uuid id PK
    uuid company_id FK
    uuid vehicle_id FK
    uuid driver_id FK
    uuid trip_id FK
    uuid reservation_id FK
    timestamptz starts_at
    timestamptz ends_at
    text status
  }
  CORPORATE_CLIENT {
    uuid id PK
    uuid company_id FK
    text name
  }
  CONTRACT {
    uuid id PK
    uuid client_id FK
    text status
    daterange validity
  }
  EMPLOYEE {
    uuid id PK
    uuid client_id FK
    text reference
  }
  ROUTE {
    uuid id PK
    uuid company_id FK
    uuid contract_id FK
    text reference
  }
  ROUTE_STOP {
    uuid id PK
    uuid route_id FK
    int sequence
  }
  TRIP {
    uuid id PK
    uuid company_id FK
    uuid route_id FK
    text status
    timestamptz starts_at
    timestamptz ends_at
  }
  BOOKING {
    uuid id PK
    uuid trip_id FK
    uuid employee_id FK
    text reference UK
    text status
  }
  INVOICE {
    uuid id PK
    uuid company_id FK
    text reference UK
    numeric total
    text status
  }
  PAYMENT {
    uuid id PK
    uuid invoice_id FK
    numeric amount
    text external_reference
  }
  WORK_ORDER {
    uuid id PK
    uuid vehicle_id FK
    text status
  }
  INCIDENT {
    uuid id PK
    uuid trip_id FK
    text status
  }
  AUDIT_EVENT {
    uuid id PK
    uuid actor_id FK
    uuid company_id FK
    text action
    timestamptz created_at
  }
```

## Relationships and integrity
- Company owns operational records; employee is tied to a corporate client; contract scopes routes and service; trips instantiate route/schedule; bookings connect employees to trips; rental requests connect customers to quotations and (on confirmation) reservation; assignments can connect either trip or reservation to vehicle/driver.
- `USER_COMPANY_ROLE`: unique `(user_id, company_id, role_id)`; no user-editable role grant.
- Company references: unique `(company_id, reference)` for human references; registration unique per company where policy requires; employee reference unique `(client_id, reference)`; booking unique on configured journey identity; route stop unique `(route_id, sequence)`; quotation unique `(request_id, version)`.
- Resource assignments: check `starts_at < ends_at`; active assignments require a vehicle or driver; exclude overlapping active ranges separately for `vehicle_id` and `driver_id` using GiST equality plus `tstzrange(starts_at, ends_at) WITH &&`, partial to reserved/assigned/active statuses. Constraint creation belongs to raw SQL migrations and requires `btree_gist`.
- Capacity is transactional (trip row `FOR UPDATE`) and calculated against confirmed/active passenger bookings; database consistency test required.
- Payment `external_reference` unique when present; invoice billable-event key unique to prevent double billing; invoice/payment immutable after posting.
- Cross-company foreign-key consistency must be enforced (composite tenant keys or equivalent scoped constraints) to prevent accidental cross-tenant relationships.
- Audit/status history append-only; indexes on tenant+status, tenant+created time, operational date windows, foreign keys, and normalized search keys.

The initial Prisma migration is intentionally empty apart from the extension, because Phase 0 authorizes no domain feature schema.

## Implemented additions — vehicle and driver register bases (FLT-01/FLT-04 in progress)

`Vehicle` is tenant-scoped with restrictive `Company` FK, company-unique normalized registration number, free-text company-supplied category/fuel/ownership values, optional seat count, optional odometer value paired with explicit `KM`/`MILE` unit, insurance/roadworthiness/registration expiry dates, next service date, notes, and archive timestamps. SQL checks enforce non-empty identity fields, positive seat counts, and paired non-negative odometer data. `Driver` is company-scoped with only the brief-listed licence, qualification, availability and status fields plus a name for record identity; no driver contact fields or defaults are stored.

`Vehicle.usualDriver` is optional and is constrained by a composite foreign key to a driver in the same company. An additional check keeps the relation's tenant key equal to the vehicle's company. The UI/API only expose this relation to users who can manage both fleet and driver records; assignment requires an active same-company driver. A pre-existing link to an archived driver can be preserved or cleared, but new links to archived drivers are rejected. Vehicle status, photo/document files and records remain unimplemented; see `docs/PROGRESS.md`.
