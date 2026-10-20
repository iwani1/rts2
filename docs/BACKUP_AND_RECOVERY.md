# Backup and recovery — policy proposal

No production database/host is configured and no backup procedure has been tested. Before launch, choose a PostgreSQL backup provider and approve recovery-point and recovery-time objectives; do not imply availability guarantees yet.

Required operational plan: automated encrypted logical or physical backups, separate access-controlled storage, encryption-key recovery, retention approved by management, backup job alerts, periodic restore to isolated PostgreSQL, migration compatibility check, documented rollback/escalation, and an audit trail of restore access. Protect personal/financial data in backup retention under Act 843. A backup is not verified until a restore drill succeeds. Docker local volume is development only and is not a backup.
