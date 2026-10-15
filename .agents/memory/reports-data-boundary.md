---
name: Reports data boundary
description: Why the current Reports page uses visit tasks and does not imply full shopper submissions exist.
---

Treat current Reports entries as task-derived operational records, not full shopper submissions. The task model stores statuses and review metadata, but the app does not capture questionnaire answers, photos, or scores. Keep those values explicitly unavailable and do not infer a submission time from task creation or update timestamps. When shopper submission is implemented, Reports should consume that actual submission data.

**Why:** The current persistence layer has no answer/evidence model, and the Reports page must not present fabricated visit results.

**How to apply:** Preserve the task-derived boundary until a real submission flow and data model exist; then replace the derived view with actual submissions and evidence.
