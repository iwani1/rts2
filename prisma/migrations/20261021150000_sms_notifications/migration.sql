-- NTF-02 (D-069): SMS delivery pipeline. SMS rows wait as PENDING until an
-- explicitly invoked dispatcher sends them through the configured provider;
-- SENT means the provider accepted the message, and DELIVERED may only be
-- set from a provider delivery confirmation. Nothing here sends or fakes a
-- delivery by itself.

ALTER TABLE "Notification" ADD COLUMN "destination" VARCHAR(254);
ALTER TABLE "Notification" ADD COLUMN "providerMessageId" VARCHAR(128);
ALTER TABLE "Notification" ADD COLUMN "attempts" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Notification" ADD COLUMN "lastError" VARCHAR(500);
ALTER TABLE "Notification" ADD COLUMN "nextAttemptAt" TIMESTAMPTZ(6);

ALTER TABLE "Notification" DROP CONSTRAINT "Notification_status_allowed";
ALTER TABLE "Notification"
  ADD CONSTRAINT "Notification_status_allowed"
  CHECK ("status" IN ('PENDING', 'SENT', 'DELIVERED', 'FAILED'));

CREATE INDEX "Notification_channel_status_nextAttemptAt_idx"
  ON "Notification"("channel", "status", "nextAttemptAt");
