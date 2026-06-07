# WORKORDER — Phase 1.7: Docker Deployment

## Goal

Ship AIstivus as a single Docker container. One `docker-compose up` and the app is
running at `localhost:8080`. User data and app-generated data are volume-mounted so
they survive image rebuilds. The running container is the daily driver — not a dev
convenience.

---

## Status

| # | Status | Item |
|---|--------|------|
| 1 | [x] | Dockerfile — multi-stage build (Node → Python + Typst) |
| 2 | [x] | `docker-compose.yml` — service, ports, volumes, env_file |
| 3 | [x] | `.dockerignore` |
| 4 | [x] | `main.py` — StaticFiles mount + SPA catch-all (already done in Phase 1.1) |
| 5 | [x] | README.md — placeholder removed; Ollama Docker note added |

Status: `[ ]` todo · `[x]` done · `[~]` deferred

---

## Key Decisions (Confirmed)

- **Multi-stage Dockerfile:** Node stage builds `frontend/dist/` → Python stage copies
  built assets and serves them. No Vite dev server in production.
- **Typst:** Pre-built binary downloaded from GitHub releases during Docker build.
  Not via apt — the apt package availability across Debian versions is unreliable.
  Install target auto-detected via `uname -m` to support both x86_64 and arm64.
- **Port binding:** `127.0.0.1:8080:8080` in docker-compose — container exposes 8080
  internally; host binds only to loopback. Users with specific LAN/VM needs can edit
  this manually.
- **Volume mounts:** `./user_data:/app/user_data` and `./app_data:/app/app_data`.
  `config.yaml` lives at `user_data/config.yaml` (established FOLLOWUPS-D); it is
  volume-mounted, not baked into the image.
- **API key:** `env_file: .env` in docker-compose. `ANTHROPIC_API_KEY` sourced from
  `.env` at container start. `.env` is gitignored and never baked into the image.
- **No first-run wizard:** Out of scope for 1.7. README covers setup steps.
- **Config paths inside `config.yaml`:** All relative `./` paths (e.g. `./app_data/data/jobs.db`)
  resolve correctly from `/app` (the container working directory). Existing configs
  do not need to be rewritten for Docker.
- **Typst `binary_path` in config.yaml:** Should be `typst` (bare name); the binary is
  on `PATH` in the container.
- **Internal host:** Uvicorn inside Docker binds to `0.0.0.0` (not `127.0.0.1`);
  the container provides isolation. The `127.0.0.1` binding in docker-compose limits
  host-side exposure.
- **`main.py` changes:** Already done. StaticFiles mounts `/assets` from
  `frontend/dist/assets` (line ~287). SPA catch-all serves `frontend/dist/index.html`
  for all non-API paths (line ~2480). No code changes needed for Phase 1.7.

---

## 1 — Dockerfile

### Approach: Multi-Stage Build

**Stage 1 — Node build**

Base image: `node:20-slim`

Steps:
1. Set `WORKDIR /app`
2. Copy `frontend/package.json` and `frontend/package-lock.json`
3. Run `npm ci` (clean install — faster, uses lockfile)
4. Copy remaining `frontend/` source
5. Run `npm run build` → outputs to `frontend/dist/`

**Stage 2 — Python runtime + Typst**

Base image: `python:3.11-slim`

Steps:
1. Set `WORKDIR /app`
2. Install OS dependencies: `curl`, `xz-utils` (for Typst archive extraction)
3. Download and install Typst binary:
   - Architecture detection: `uname -m` → `x86_64` or `aarch64`
   - Download URL: `https://github.com/typst/typst/releases/download/v{VERSION}/typst-{TARGET}-unknown-linux-musl.tar.xz`
   - Extract binary only: `tar -xJ --strip-components=1 -C /usr/local/bin`
   - Pin version via `ARG TYPST_VERSION` — set default to latest stable at time of build
   - After install: `typst --version` to verify
4. Copy `requirements.txt`, run `pip install --no-cache-dir -r requirements.txt`
5. Copy application source files (Python files, `templates/`, `tests/`)
6. Copy built frontend from Stage 1: `COPY --from=build /app/frontend/dist ./frontend/dist`
7. Expose port 8080
8. Set default command: `uvicorn main:app --host 0.0.0.0 --port 8080`

### What is NOT copied into the image

- `user_data/` — volume-mounted; never baked in
- `app_data/` — volume-mounted; never baked in
- `.env` — injected at runtime via `env_file`
- `memory/` — local Claude tooling, never committed
- `ignore/` — local archive
- `frontend/node_modules/` — installed during build, discarded between stages
- `frontend/src/` — build artifacts only in final image
- `tests/` — not needed in production image (exclude to reduce image size)

---

## 2 — docker-compose.yml

```yaml
services:
  aistivus:
    build: .
    ports:
      - "127.0.0.1:8080:8080"
    volumes:
      - ./user_data:/app/user_data
      - ./app_data:/app/app_data
    env_file:
      - .env
    restart: unless-stopped
```

**Notes:**
- Port bound to `127.0.0.1` on the host — LAN-only users edit this to `0.0.0.0:8080:8080`.
- Both volume mounts must exist on the host before `docker-compose up` — Docker will
  create them as empty directories if missing (acceptable; app initializes itself).
- `env_file: .env` — file must exist (can be empty) or docker-compose will error.
  Document this in README.

---

## 3 — .dockerignore

Key exclusions:

```
# Python runtime artifacts
__pycache__/
*.pyc
*.pyo
*.pyd
.Python
*.egg-info/

# User and app data — volume-mounted at runtime
user_data/
app_data/

# Dev/tooling — not needed in image
memory/
ignore/
.git/
.gitignore
.env
*.env

# Frontend — built during Docker build; source not needed in final image
frontend/node_modules/
frontend/src/
frontend/public/
frontend/.vite/

# Docs — not needed in production image
app_docs/
pages/
*.md
!templates/typst/**/*.typ
!templates/*.md

# Tests — not needed in production image
tests/
```

**Note on `!templates/` exceptions:** The `templates/` directory ships with the image
(Typst templates are bundled). The `*.md` exclusion above needs `!templates/typst/**/*.typ`
to restore those. Review the exact glob behavior of .dockerignore at implementation time —
simpler to just not exclude the `templates/` directory and let the `*.md` rule handle docs.

---

## 4 — main.py Status

No changes needed. Both required features are already implemented:

- **StaticFiles mount** (`main.py:~287`): Serves `frontend/dist/assets/` at `/assets`.
- **SPA catch-all** (`main.py:~2480`): Returns `frontend/dist/index.html` for all
  non-API paths so React Router handles client-side routing.

The one behavioral change for Docker: Uvicorn is started with `--host 0.0.0.0` in the
`CMD` (not `127.0.0.1`). The `__main__` block reads host from `config.yaml` and is used
only for local dev; Docker uses the `CMD` directly, bypassing it. No code change needed.

---

## Validation Plan

### Build
```
docker-compose build
```
Expected: successful multi-stage build, `typst --version` output visible in build log.

### First run
```
# Copy template config if not already done
cp templates/CONFIG_TEMPLATE.yaml user_data/config.yaml

# Create empty .env (or add Anthropic key)
touch .env

# Start
docker-compose up
```
Expected: container starts, logs show `aistivus_ready` at `0.0.0.0:8080`.

### Smoke test
1. Open `http://localhost:8080` → Dashboard renders
2. Open `http://localhost:8080/jobs` → React Router handles route (no 404)
3. `GET http://localhost:8080/api/v1/health` → `{"status": "ok"}` or `"degraded"` with
   model list present
4. Upload a `.typ` file on any job's RESUME/COVER tab → compile if Typst key works
5. Check Settings → Documents Storage card → shows Typst available

### Data persistence check
```
docker-compose down
docker-compose up
```
Expected: jobs, applications, and documents are still present (data survived restart).

---

## Execution Notes

- Decide Typst version to pin at implementation time — check latest stable release.
- The `.dockerignore` glob behavior for `*.md` exclusions needs a manual test during
  implementation to confirm `templates/typst/` files are included correctly.
- Consider adding a `HEALTHCHECK` directive to the Dockerfile (calls `/api/v1/health`)
  so `docker ps` shows container health status. Low priority — add if easy.
- `.env` file: docker-compose errors if `env_file` path doesn't exist. Either document
  "create a `.env` before first run" in README, or make env_file optional by checking
  at runtime. The README approach is simpler.
