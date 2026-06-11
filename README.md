# AIstivus

> **AI Job Search Helper for the Rest of Us**

Because companies use AI to filter candidates. You should use AI to find better ones.

AIstivus is a locally-hosted, open-source web application — an AI-assisted command center for managing your entire job search: evaluate job descriptions against your background, track applications through the full lifecycle, and generate tailored resumes with Typst.

**Everything runs on your machine. Your data stays private.**

---

## What It Does

- **Evaluate job descriptions** against your personal background using local AI models (Ollama) or cloud providers (Anthropic)
- **Import from URL** — paste a job posting URL and let Crawl4AI fetch and extract the JD and metadata automatically
- **Structured scoring** — overall fit, role fit, scope fit, culture signals, compensation alignment
- **ATS keyword extraction** from every JD for resume tailoring
- **Track applications** through the full lifecycle with audit history and activity log
- **Document management** — import, compile, and view Typst-based resumes and cover letters
- **Job Search Profile** — AI-assisted editor for your personal background context

---

## Current Status

| Phase | Status | Description |
|---|---|---|
| Phase 1.6 — Document Management | ✅ Complete | Typst document import, compile, view; document management UI |
| Phase 1.7 — Docker | ✅ Complete | Single-container Docker deployment |
| Phase 2.0 Step 1 — CI/CD | ✅ Complete | GitHub Actions (pytest + ruff + vitest + build) |
| Phase 2.0 Step 2 — Nav | ✅ Complete | AppHeader nav links; `/career` stub page |
| Phase 2.0 Step 3 — URL Ingestion | ✅ Complete | Crawl4AI integration on Evaluate page |
| Phase 2.0 Steps 4–5 | 🔲 Planned | Prompt editing, memory, dashboard redesign, career workflow |

---

## Quick Start (Docker)

### Prerequisites

- [Docker](https://docs.docker.com/get-docker/) + Docker Compose
- Optional: [Ollama](https://ollama.com) running on the host for local AI models
- Optional: Anthropic API key for cloud evaluations

### 1. Clone the repo

```bash
git clone https://github.com/yourusername/aistivus.git
cd aistivus
```

### 2. Copy config and profile templates

```bash
mkdir -p user_data/my_data
cp templates/CONFIG_TEMPLATE.yaml user_data/config.yaml
cp templates/JOBSEARCH_TEMPLATE.md user_data/my_data/jobsearch.md
```

Edit `user_data/my_data/jobsearch.md` — this is the AI's primary context for every evaluation. Fill it in before running evaluations.

> **Ollama users:** Inside the container, `localhost` refers to the container itself — not your host machine. If Ollama is running on your Mac or Linux host, set `ollama.base_url` in `user_data/config.yaml` to `http://host.docker.internal:11434`.

### 3. Set up your API key (optional — Anthropic only)

```bash
cp .env.example .env
# Edit .env and add your ANTHROPIC_API_KEY
```

### 4. Start the app

```bash
docker-compose up
```

### 5. Open your browser

```
http://localhost:8080
```

---

## Volume Mounts

Docker mounts two directories from your host machine:

| Directory | Mount | Contents |
|---|---|---|
| `./user_data` | `/app/user_data` | Your config, job search profile, resume templates — **you own these** |
| `./app_data` | `/app/app_data` | App-generated data: SQLite database, compiled docs, logs — **app-generated** |

Back these up before upgrading. Your job data lives in `app_data/data/jobs.db`.

---

## Local Dev Setup

For contributors or running without Docker.

### Prerequisites

- Python 3.11+
- Node.js 18+
- Optional: [Typst](https://typst.app) binary for document compilation
- Optional: [Ollama](https://ollama.com) for local AI models

### Backend

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

# Set up config and profile (see Quick Start steps 2–3 above)

python3 main.py
# Runs at http://localhost:8080
```

### Frontend (dev mode)

```bash
cd frontend
npm install
npm run dev
# Vite dev server at http://localhost:3000
# Proxies /api/* to the backend on 8080
```

---

## Typst (Optional)

Typst is used for resume and cover letter compilation. The app degrades gracefully without it — you can still upload and view `.pdf` files; only compilation is disabled.

Install:

```bash
# macOS
brew install typst

# Linux
snap install typst
```

Bundled templates are in `templates/typst/`. Copy a template to get started, then upload it via the document tab on any job.

---

## Crawl4AI (Optional — URL Ingestion)

Crawl4AI enables the "Import from URL" feature on the Evaluate page. It renders job posting pages with a headless browser and extracts structured content. Like Ollama, it runs as a standalone service.

### Standalone setup (recommended)

```bash
docker run -d \
  --name crawl \
  -p 127.0.0.1:11235:11235 \
  --restart unless-stopped \
  unclecode/crawl4ai:latest
```

Then set in `user_data/config.yaml`:

```yaml
crawl4ai:
  base_url: http://localhost:11235
```

### Docker Compose (optional)

An optional `crawl` service block is included as a comment in `docker-compose.yml`. Uncomment it to manage Crawl4AI within the same stack. If you do, use `base_url: http://crawl:11235` (the Docker network name).

The app degrades gracefully without Crawl4AI — the URL import row shows an inline error and the rest of the form remains fully usable for manual entry.

---

## Project Structure

```
aistivus/
├── main.py                   FastAPI server entry point
├── database.py               All database logic and schema
├── evaluator.py              JD evaluation pipeline
├── document_routes.py        Document upload, compile, serve routes
├── profile_routes.py         Job Search Profile routes + AI chat
├── scrape_routes.py          URL ingestion routes (Crawl4AI + LLM gap-fill)
├── llm_client.py             LLM abstraction (Ollama, Anthropic)
├── templates/                Template files — copy, don't edit in place
│   ├── CONFIG_TEMPLATE.yaml
│   ├── JOBSEARCH_TEMPLATE.md
│   └── typst/                Bundled Typst resume + cover letter templates
├── frontend/                 React 18 / TypeScript / Vite frontend
├── tests/                    pytest backend tests
├── user_data/                Your data (gitignored) — Docker volume
│   ├── config.yaml
│   └── my_data/
│       └── jobsearch.md
└── app_data/                 App-generated data (gitignored) — Docker volume
    ├── data/                 SQLite database
    ├── application_docs/     Uploaded and compiled documents
    └── logs/
```

---

## Security

AIstivus is designed as a local, single-user tool:

- Binds to `127.0.0.1` by default — not accessible from the network
- All data stored locally in SQLite — nothing sent externally unless you configure a cloud LLM
- API keys in `.env` only — never in the database or config
- If you expose the port (WSL2, bridged VM, Docker with host networking), use a reverse proxy with authentication (Traefik + Authelia recommended)

---

## Supported Platforms

| Platform | Status |
|---|---|
| macOS | ✅ Fully supported |
| Linux | ✅ Fully supported |
| Windows (Docker) | ✅ Supported via Docker (Phase 1.7) |
| Windows (WSL2) | ⚠️ Community supported — use Linux tooling within WSL2 |
| Windows (native) | ❌ Not supported |

---

## Contributing

Contributions welcome. See [app_docs/FEATURES.md](app_docs/FEATURES.md) for the backlog of ideas and [PROJECT_SPEC.md](PROJECT_SPEC.md) for the full specification.

---

## License

MIT — see [LICENSE](LICENSE)

---

## Legal

AI-generated evaluations are advisory only. Always apply your own judgment before making application decisions.
