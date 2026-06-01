---
name: db-policy-change
description: Database wipe policy changed — delta migrations required from this point forward
metadata:
  type: project
---

Schema wipe policy is now RETIRED. The user is actively using the system with real data.

All database schema changes from this point forward must be made as **delta ALTER TABLE / CREATE TABLE** statements applied to the existing database.

**Why:** User has real job search data in the DB. A wipe would destroy it.

**How to apply:** Before any schema change, write the delta SQL explicitly. Never drop and recreate tables. Never call `init_db()` in a way that would destroy existing data. Add new tables or columns with ALTER TABLE only.
