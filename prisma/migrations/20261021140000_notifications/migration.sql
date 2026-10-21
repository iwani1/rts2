-- NTF-01 (D-068): in-app notification service. One row per recipient login and
-- channel, with a dedupe key so duplicate events never double-notify. In-app
-- delivery is recorded in the same transaction as the governed event, so
-- DELIVERED here means "stored in the recipient's inbox" and nothing more.
-- SMS/EMAIL channels are reserved for the NTF-02/03 adapters.

CREATE TABLE "Notification" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "channel" TEXT NOT NULL DEFAULT 'IN_APP',
  "type" VARCHAR(64) NOT NULL,
  "title" VARCHAR(200) NOT NULL,
  "body" VARCHAR(1000) NOT NULL,
  "entityType" VARCHAR(64),
  "entityId" TEXT,
  "dedupeKey" VARCHAR(200) NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'DELIVERED',
  "readAt" TIMESTAMPTZ(6),
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "Notification_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Notification_channel_allowed" CHECK ("channel" IN ('IN_APP', 'SMS', 'EMAIL')),
  CONSTRAINT "Notification_status_allowed" CHECK ("status" IN ('PENDING', 'DELIVERED', 'FAILED'))
);

CREATE UNIQUE INDEX "Notification_companyId_userId_channel_dedupeKey_key"
  ON "Notification"("companyId", "userId", "channel", "dedupeKey");
CREATE INDEX "Notification_companyId_userId_readAt_createdAt_idx"
  ON "Notification"("companyId", "userId", "readAt", "createdAt");
CREATE INDEX "Notification_companyId_userId_createdAt_idx"
  ON "Notification"("companyId", "userId", "createdAt");

ALTER TABLE "Notification"
  ADD CONSTRAINT "Notification_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Notification"
  ADD CONSTRAINT "Notification_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Per-user channel preferences (D-068). The in-app switch is enforced
-- immediately; sms/email switches are stored now and enforced by the
-- NTF-02/03 adapters when they land.
CREATE TABLE "NotificationPreference" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "inAppEnabled" BOOLEAN NOT NULL DEFAULT true,
  "smsEnabled" BOOLEAN NOT NULL DEFAULT true,
  "emailEnabled" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(6) NOT NULL,

  CONSTRAINT "NotificationPreference_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "NotificationPreference_companyId_userId_key"
  ON "NotificationPreference"("companyId", "userId");

ALTER TABLE "NotificationPreference"
  ADD CONSTRAINT "NotificationPreference_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "NotificationPreference"
  ADD CONSTRAINT "NotificationPreference_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
