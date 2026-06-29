# FOLLOWUP — Phase 2.5: Public / Private Repo Split

Deferred during Phase 2.5 testing session (2026-06-29). Not a code change —
infrastructure and git workflow work. Do in a standalone session.

## Status

| # | Status | Title |
|---|--------|-------|
| F1 | [ ] | Split public and private repos via git submodule |

Status markers: `[ ]` todo · `[x]` done · `[~]` deferred

---

## Items

### F1 — Split public and private repos via git submodule

**Why:** Developing on two machines (laptop + desktop). Personal data dirs
(`memory/`, `user_data/my_data/`, `ignore/`) need to sync across machines
without manual copying. Codebase should be shareable publicly.

**Approach:** Git submodule. Create a private GitHub repo. Add it as `./private/`
submodule inside the public repo. Move the three personal dirs into it.

**Structure after:**
```
aistivus/
├── private/                  ← submodule (private GitHub repo)
│   ├── memory/               ← was memory/
│   ├── my_data/              ← was user_data/my_data/
│   └── ignore/               ← was ignore/
├── user_data/
│   └── config.yaml           ← stays here; gitignored; set up per-machine
└── ... (everything else unchanged)
```

**Steps:**
1. Create private GitHub repo (e.g. `aistivus-private`)
2. `git submodule add <private-repo-url> ./private`
3. `mv memory/ private/ && mv ignore/ private/ && mv user_data/my_data private/`
4. Update `CLAUDE.md` — memory path instruction: `memory/` → `private/memory/`
5. Update `user_data/config.yaml` — `jobsearch_md_path: ./private/my_data/jobsearch.md`
6. Update `.gitignore` — remove `memory/` and `ignore/` entries; `user_data/my_data/` no longer needs ignoring (it moved)
7. Update `docker-compose.yml` — add `./private:/app/private` volume mount
8. Commit both repos; push both; verify on second machine with `git clone --recurse-submodules`

**Day-to-day workflow (after setup):**
- After editing jobsearch.md or memory on machine A: `cd private && git add . && git commit && git push && cd ..`
- On machine B when switching: `git pull && git submodule update --remote`
- Consider a small wrapper script that pushes both repos in one command to avoid forgetting

**Decision point before starting:**
- `user_data/config.yaml` — keep gitignored-but-untracked (set up per-machine, same as today). Don't put it in `private/` — it's machine-specific (paths, host, port), not personal data.

**Notes:**
- `user_data/my_data/` contains `resume_templates/` — these move to `private/my_data/` too. Confirm this is desired before starting.
- No git history is lost — all three dirs are currently gitignored (untracked).
- CLAUDE.md memory path update (step 4) is what allows future Claude sessions to find `MEMORY.md` after the move.
- Anyone cloning the public repo gets an empty `private/` dir — correct behavior.
