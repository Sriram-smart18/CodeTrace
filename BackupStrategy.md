# TraceCode Backup & Data Retention Strategy

This specification details database backups, compliance retention cycles, and automated cleanup jobs for the **TraceCode** platform.

---

## 1. Database Backup Schedule

PostgreSQL database backups are orchestrated daily via custom PG cron schedules:

| Target Backup Type | Frequency | Storage Location | Retention Window |
| :--- | :--- | :--- | :--- |
| **Incremental Backup** | Every 6 hours | Local directory / Mounted volume | 7 days |
| **Full Snapshot** | Daily at 01:00 AM | AWS S3 Bucket (Glacier-Deep archive) | 30 days |
| **Archived Exam Backup**| End of Semester / Term | Durable offline storage | 5 years |

### Example Postgres Dump Script
```bash
pg_dump -h $DB_HOST -U $DB_USER -d $DB_NAME -F c -b -v -f "/backups/tracecode_$(date +%Y%m%d_%H%M%S).dump"
```

---

## 2. Submission Data Retention Policy

To manage server load and storage capacities, student playground files and historical evaluation results follow these cycles:

* **Attempts History snapshots**: Retained for the active academic semester (6 months). After course completion, playground attempts are archived.
* **Final Submissions & Grades**: Retained indefinitely (or up to 5 years for academic accreditation audits).

---

## 3. Proctoring & Audit Log Cleanup

To maintain proctoring and detection performance:
* **Realtime typing events**: Activity event snapshots (typing logs) are kept for **30 days** before garbage collection.
* **Fraud alerts**: Retained for **90 days** or until review resolution.
* **Server Health Logs**: Telemetry counts inside the Node.js server are stored in memory and reset on server reload/restart. Log files on disk are rotated at 10 MB size limits and capped to 5 logs back-references.
