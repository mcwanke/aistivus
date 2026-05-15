---
name: dead-config
description: Config keys in config.yaml that are unreferenced in code
metadata:
  type: project
---

`min_score_threshold: 6.0` under the `evaluation:` block in config.yaml is not referenced anywhere in main.py, evaluator.py, or database.py. It was likely planned for filtering jobs below a score threshold but never wired up. Safe to delete or leave in place.
