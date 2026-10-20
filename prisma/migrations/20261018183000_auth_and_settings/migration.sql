CREATE TABLE "Company" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "Company_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "User" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "emailVerified" BOOLEAN NOT NULL DEFAULT false,
  "image" TEXT,
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

CREATE TABLE "Session" (
  "id" TEXT NOT NULL,
  "expiresAt" TIMESTAMPTZ(6) NOT NULL,
  "token" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(6) NOT NULL,
  "ipAddress" TEXT,
  "userAgent" TEXT,
  "userId" TEXT NOT NULL,
  CONSTRAINT "Session_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "Session_token_key" ON "Session"("token");
CREATE INDEX "Session_userId_idx" ON "Session"("userId");
CREATE INDEX "Session_expiresAt_idx" ON "Session"("expiresAt");

CREATE TABLE "Account" (
  "id" TEXT NOT NULL,
  "accountId" TEXT NOT NULL,
  "providerId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "accessToken" TEXT,
  "refreshToken" TEXT,
  "idToken" TEXT,
  "accessTokenExpiresAt" TIMESTAMPTZ(6),
  "refreshTokenExpiresAt" TIMESTAMPTZ(6),
  "scope" TEXT,
  "password" TEXT,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "Account_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "Account_providerId_accountId_key" ON "Account"("providerId", "accountId");
CREATE INDEX "Account_userId_idx" ON "Account"("userId");

CREATE TABLE "Verification" (
  "id" TEXT NOT NULL,
  "identifier" TEXT NOT NULL,
  "value" TEXT NOT NULL,
  "expiresAt" TIMESTAMPTZ(6) NOT NULL,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "Verification_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "Verification_identifier_idx" ON "Verification"("identifier");

CREATE TABLE "RateLimit" (
  "id" TEXT NOT NULL,
  "key" TEXT NOT NULL,
  "count" INTEGER NOT NULL,
  "lastRequest" BIGINT NOT NULL,
  CONSTRAINT "RateLimit_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "RateLimit_key_key" ON "RateLimit"("key");

CREATE TABLE "AuditEvent" (
  "id" TEXT NOT NULL,
  "actorId" TEXT,
  "companyId" TEXT,
  "action" TEXT NOT NULL,
  "entityType" TEXT NOT NULL,
  "entityId" TEXT NOT NULL,
  "summary" JSONB NOT NULL,
  "ipAddress" TEXT,
  "requestId" TEXT,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AuditEvent_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AuditEvent_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "AuditEvent_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "AuditEvent_companyId_createdAt_idx" ON "AuditEvent"("companyId", "createdAt");
CREATE INDEX "AuditEvent_entityType_entityId_createdAt_idx" ON "AuditEvent"("entityType", "entityId", "createdAt");
CREATE INDEX "AuditEvent_actorId_createdAt_idx" ON "AuditEvent"("actorId", "createdAt");

CREATE TABLE "Setting" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "key" TEXT NOT NULL,
  "value" JSONB,
  "configured" BOOLEAN NOT NULL DEFAULT false,
  "updatedAt" TIMESTAMPTZ(6) NOT NULL,
  "updatedById" TEXT,
  CONSTRAINT "Setting_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Setting_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "Setting_companyId_key_key" ON "Setting"("companyId", "key");
CREATE INDEX "Setting_companyId_configured_idx" ON "Setting"("companyId", "configured");

-- Audit evidence is append-only, including for privileged application roles.
CREATE FUNCTION prevent_audit_event_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'AuditEvent rows are append-only';
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "AuditEvent_immutable"
  BEFORE UPDATE OR DELETE ON "AuditEvent"
  FOR EACH ROW EXECUTE FUNCTION prevent_audit_event_mutation();


CREATE TABLE "Role" (
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  CONSTRAINT "Role_pkey" PRIMARY KEY ("code")
);

CREATE TABLE "RolePermission" (
  "roleCode" TEXT NOT NULL,
  "permission" TEXT NOT NULL,
  "scope" TEXT NOT NULL,
  CONSTRAINT "RolePermission_pkey" PRIMARY KEY ("roleCode", "permission", "scope"),
  CONSTRAINT "RolePermission_roleCode_fkey" FOREIGN KEY ("roleCode") REFERENCES "Role"("code") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "RolePermission_permission_scope_idx" ON "RolePermission"("permission", "scope");

CREATE TABLE "UserRoleAssignment" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "companyId" TEXT,
  "roleCode" TEXT NOT NULL,
  "assignedById" TEXT,
  "reason" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "revokedAt" TIMESTAMPTZ(6),
  CONSTRAINT "UserRoleAssignment_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "UserRoleAssignment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "UserRoleAssignment_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "UserRoleAssignment_roleCode_fkey" FOREIGN KEY ("roleCode") REFERENCES "Role"("code") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "UserRoleAssignment_assignedById_fkey" FOREIGN KEY ("assignedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "UserRoleAssignment_reason_nonempty" CHECK (length(trim("reason")) > 0),
  CONSTRAINT "UserRoleAssignment_global_scope_check" CHECK (("roleCode" = 'SUPER_ADMIN' AND "companyId" IS NULL) OR ("roleCode" <> 'SUPER_ADMIN' AND "companyId" IS NOT NULL))
);
CREATE INDEX "UserRoleAssignment_userId_revokedAt_idx" ON "UserRoleAssignment"("userId", "revokedAt");
CREATE INDEX "UserRoleAssignment_companyId_roleCode_revokedAt_idx" ON "UserRoleAssignment"("companyId", "roleCode", "revokedAt");
CREATE UNIQUE INDEX "UserRoleAssignment_active_company_unique" ON "UserRoleAssignment"("userId", "companyId", "roleCode") WHERE "revokedAt" IS NULL AND "companyId" IS NOT NULL;
CREATE UNIQUE INDEX "UserRoleAssignment_active_global_unique" ON "UserRoleAssignment"("userId", "roleCode") WHERE "revokedAt" IS NULL AND "companyId" IS NULL;

INSERT INTO "Role" ("code", "name") VALUES
  ('SUPER_ADMIN', 'Super Administrator'),
  ('OPS_MANAGER', 'Operations Manager'),
  ('DISPATCHER', 'Dispatcher'),
  ('FLEET_MANAGER', 'Fleet Manager'),
  ('CORP_HR_ADMIN', 'Corporate HR Administrator'),
  ('DRIVER', 'Driver'),
  ('PASSENGER', 'Employee / Passenger'),
  ('RENTAL_CUSTOMER', 'Rental Customer'),
  ('FINANCE_OFFICER', 'Finance Officer'),
  ('MAINTENANCE_TECHNICIAN', 'Maintenance Technician');

INSERT INTO "RolePermission" ("roleCode", "permission", "scope") VALUES
  ('SUPER_ADMIN', 'user:manage', 'GLOBAL'),
  ('SUPER_ADMIN', 'settings:read', 'GLOBAL'),
  ('SUPER_ADMIN', 'settings:write', 'GLOBAL'),
  ('SUPER_ADMIN', 'audit:read', 'GLOBAL'),
  ('SUPER_ADMIN', 'customer:manage', 'GLOBAL'),
  ('SUPER_ADMIN', 'rental:manage', 'GLOBAL'),
  ('SUPER_ADMIN', 'quotation:approve', 'GLOBAL'),
  ('SUPER_ADMIN', 'fleet:manage', 'GLOBAL'),
  ('SUPER_ADMIN', 'driver:manage', 'GLOBAL'),
  ('SUPER_ADMIN', 'maintenance:manage', 'GLOBAL'),
  ('SUPER_ADMIN', 'client:manage', 'GLOBAL'),
  ('SUPER_ADMIN', 'employee:manage', 'GLOBAL'),
  ('SUPER_ADMIN', 'booking:manage', 'GLOBAL'),
  ('SUPER_ADMIN', 'route:manage', 'GLOBAL'),
  ('SUPER_ADMIN', 'trip:dispatch', 'GLOBAL'),
  ('SUPER_ADMIN', 'incident:manage', 'GLOBAL'),
  ('SUPER_ADMIN', 'invoice:manage', 'GLOBAL'),
  ('SUPER_ADMIN', 'payment:record', 'GLOBAL'),
  ('SUPER_ADMIN', 'report:export', 'GLOBAL'),
  ('OPS_MANAGER', 'user:manage', 'COMPANY_NONPRIVILEGED'),
  ('OPS_MANAGER', 'settings:read', 'COMPANY'),
  ('OPS_MANAGER', 'settings:write', 'LIMITED_OPERATIONAL'),
  ('OPS_MANAGER', 'audit:read', 'OPERATIONAL_SUBSET'),
  ('OPS_MANAGER', 'customer:manage', 'COMPANY'),
  ('OPS_MANAGER', 'rental:manage', 'COMPANY'),
  ('OPS_MANAGER', 'quotation:approve', 'COMPANY'),
  ('OPS_MANAGER', 'fleet:manage', 'COMPANY'),
  ('OPS_MANAGER', 'driver:manage', 'COMPANY'),
  ('OPS_MANAGER', 'maintenance:manage', 'COMPANY'),
  ('OPS_MANAGER', 'client:manage', 'COMPANY'),
  ('OPS_MANAGER', 'employee:manage', 'COMPANY'),
  ('OPS_MANAGER', 'booking:manage', 'COMPANY'),
  ('OPS_MANAGER', 'route:manage', 'COMPANY'),
  ('OPS_MANAGER', 'trip:dispatch', 'COMPANY'),
  ('OPS_MANAGER', 'incident:manage', 'COMPANY'),
  ('OPS_MANAGER', 'invoice:manage', 'READ_ONLY'),
  ('OPS_MANAGER', 'report:export', 'OPERATIONAL'),
  ('DISPATCHER', 'settings:read', 'DISPATCH_ONLY'),
  ('DISPATCHER', 'rental:manage', 'ENQUIRY_CONTEXT'),
  ('DISPATCHER', 'fleet:manage', 'READ_ASSIGN_SUBSET'),
  ('DISPATCHER', 'driver:manage', 'READ_ASSIGN_SUBSET'),
  ('DISPATCHER', 'employee:manage', 'ROSTER_MINIMUM'),
  ('DISPATCHER', 'booking:manage', 'COMPANY'),
  ('DISPATCHER', 'route:manage', 'COMPANY'),
  ('DISPATCHER', 'trip:dispatch', 'COMPANY'),
  ('DISPATCHER', 'incident:manage', 'COMPANY'),
  ('DISPATCHER', 'report:export', 'DISPATCH_SCOPE'),
  ('FLEET_MANAGER', 'settings:read', 'FLEET_ONLY'),
  ('FLEET_MANAGER', 'audit:read', 'FLEET_SUBSET'),
  ('FLEET_MANAGER', 'settings:write', 'FLEET_ONLY'),
  ('FLEET_MANAGER', 'fleet:manage', 'COMPANY'),
  ('FLEET_MANAGER', 'driver:manage', 'COMPANY'),
  ('FLEET_MANAGER', 'maintenance:manage', 'APPROVE_RELEASE'),
  ('FLEET_MANAGER', 'incident:manage', 'FLEET_INCIDENTS'),
  ('FLEET_MANAGER', 'report:export', 'FLEET_SCOPE'),
  ('CORP_HR_ADMIN', 'user:manage', 'OWN_COMPANY'),
  ('CORP_HR_ADMIN', 'settings:read', 'OWN_POLICY'),
  ('CORP_HR_ADMIN', 'client:manage', 'OWN_COMPANY'),
  ('CORP_HR_ADMIN', 'employee:manage', 'OWN_COMPANY'),
  ('CORP_HR_ADMIN', 'booking:manage', 'OWN_COMPANY'),
  ('CORP_HR_ADMIN', 'route:manage', 'OWN_CLIENT_READ'),
  ('CORP_HR_ADMIN', 'trip:dispatch', 'OWN_CLIENT_READ'),
  ('CORP_HR_ADMIN', 'invoice:manage', 'OWN_CLIENT_READ'),
  ('CORP_HR_ADMIN', 'report:export', 'OWN_CLIENT_DATA'),
  ('DRIVER', 'rental:manage', 'ASSIGNED_EXECUTION'),
  ('DRIVER', 'fleet:manage', 'OWN_ASSIGNED_VEHICLE_READ'),
  ('DRIVER', 'driver:manage', 'OWN_PROFILE'),
  ('DRIVER', 'maintenance:manage', 'REPORT_DEFECT'),
  ('DRIVER', 'booking:manage', 'ASSIGNED_TRIP_EVENT'),
  ('DRIVER', 'trip:dispatch', 'OWN_TRIP_EVENTS'),
  ('DRIVER', 'incident:manage', 'OWN_REPORT'),
  ('PASSENGER', 'settings:read', 'OWN_POLICY'),
  ('PASSENGER', 'employee:manage', 'OWN_PROFILE'),
  ('PASSENGER', 'booking:manage', 'OWN'),
  ('PASSENGER', 'trip:dispatch', 'OWN_TRIP_STATUS'),
  ('PASSENGER', 'invoice:manage', 'OWN_INVOICE'),
  ('PASSENGER', 'report:export', 'OWN_DATA'),
  ('RENTAL_CUSTOMER', 'customer:manage', 'OWN_PROFILE'),
  ('RENTAL_CUSTOMER', 'rental:manage', 'OWN_CREATE_READ_RESPOND'),
  ('RENTAL_CUSTOMER', 'quotation:approve', 'OWN_ACCEPT_DECLINE'),
  ('RENTAL_CUSTOMER', 'invoice:manage', 'OWN_INVOICE'),
  ('RENTAL_CUSTOMER', 'report:export', 'OWN_DATA'),
  ('FINANCE_OFFICER', 'settings:read', 'FINANCE_ONLY'),
  ('FINANCE_OFFICER', 'settings:write', 'FINANCE_ONLY'),
  ('FINANCE_OFFICER', 'audit:read', 'FINANCE_SUBSET'),
  ('FINANCE_OFFICER', 'customer:manage', 'BILLING_CONTEXT'),
  ('FINANCE_OFFICER', 'rental:manage', 'INVOICE_CONTEXT'),
  ('FINANCE_OFFICER', 'quotation:approve', 'DELEGATED_APPROVAL'),
  ('FINANCE_OFFICER', 'fleet:manage', 'COST_READ'),
  ('FINANCE_OFFICER', 'maintenance:manage', 'COST_READ'),
  ('FINANCE_OFFICER', 'client:manage', 'BILLING_CONTEXT'),
  ('FINANCE_OFFICER', 'booking:manage', 'BILLING_READ'),
  ('FINANCE_OFFICER', 'trip:dispatch', 'BILLING_LINK_READ'),
  ('FINANCE_OFFICER', 'invoice:manage', 'COMPANY'),
  ('FINANCE_OFFICER', 'payment:record', 'COMPANY'),
  ('FINANCE_OFFICER', 'report:export', 'FINANCE_SCOPE'),
  ('MAINTENANCE_TECHNICIAN', 'fleet:manage', 'MAINTENANCE_SUBSET'),
  ('MAINTENANCE_TECHNICIAN', 'maintenance:manage', 'WORK_ORDER_UPDATE_NO_RELEASE'),
  ('MAINTENANCE_TECHNICIAN', 'incident:manage', 'REPORT_UPDATE_ASSIGNED');
