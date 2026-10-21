CREATE TABLE "UserClientBinding" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "clientId" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "boundById" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "revokedAt" TIMESTAMPTZ(6),
  CONSTRAINT "UserClientBinding_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "UserClientBinding_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "UserClientBinding_user_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "UserClientBinding_client_fkey" FOREIGN KEY ("companyId", "clientId") REFERENCES "Client"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "UserClientBinding_boundBy_fkey" FOREIGN KEY ("boundById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "UserClientBinding_reason_nonempty" CHECK (length(trim("reason")) > 0)
);
CREATE INDEX "UserClientBinding_companyId_userId_revokedAt_idx" ON "UserClientBinding"("companyId", "userId", "revokedAt");
CREATE INDEX "UserClientBinding_companyId_clientId_revokedAt_idx" ON "UserClientBinding"("companyId", "clientId", "revokedAt");

-- One active binding per user in a company, and one client per binding.
CREATE UNIQUE INDEX "UserClientBinding_active_user_unique"
  ON "UserClientBinding"("companyId", "userId")
  WHERE "revokedAt" IS NULL;

-- Bindings are audit records: never updated (except revocation) or deleted.
CREATE FUNCTION enforce_binding_mutability() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'UserClientBinding rows cannot be deleted';
  END IF;
  IF OLD."revokedAt" IS NOT NULL THEN
    RAISE EXCEPTION 'A revoked UserClientBinding cannot change';
  END IF;
  IF NEW."companyId" IS DISTINCT FROM OLD."companyId"
     OR NEW."userId" IS DISTINCT FROM OLD."userId"
     OR NEW."clientId" IS DISTINCT FROM OLD."clientId"
     OR NEW."reason" IS DISTINCT FROM OLD."reason"
     OR NEW."boundById" IS DISTINCT FROM OLD."boundById"
     OR NEW."createdAt" IS DISTINCT FROM OLD."createdAt" THEN
    RAISE EXCEPTION 'Only revocation may change a UserClientBinding';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "UserClientBinding_mutation_guard"
  BEFORE UPDATE OR DELETE ON "UserClientBinding"
  FOR EACH ROW EXECUTE FUNCTION enforce_binding_mutability();
