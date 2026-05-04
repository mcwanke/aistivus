# AIstivus

> **AI Job Search Helper for the Rest of Us**

Because companies use AI to filter candidates. You should use AI to find better ones.

AIstivus is a locally-hosted, open-source web application that gives job seekers an AI-assisted command center for managing their entire job search — from evaluation through application tracking and resume generation.

**Everything runs on your machine. Your data stays private.**

---

## What It Does

- **Evaluate job descriptions** against your personal background and preferences using local AI models (Ollama) or cloud providers (Anthropic, OpenAI)
- **Track evaluations** with structured scoring: overall fit, role fit, scope fit, culture signals, compensation alignment
- **Extract keywords** from each JD for ATS-optimized resume tailoring
- **Compare evaluations** across models — run cheap local evaluations for triage, then re-run top candidates against a more capable model
- **Track applications** through the full lifecycle with audit history
- **Generate tailored resumes** from a reusable content library (Phase 2)
- **Discover new roles** automatically via job board scraping (Phase 3)

---

## Current Status

**Phase 0.1 — Working** ✅

The core evaluation pipeline is operational. You can evaluate job descriptions, view results, and compare evaluations across runs.

See [PROJECT_SPEC.md](PROJECT_SPEC.md) for the full roadmap.

---

## Quick Start

### Prerequisites

- macOS or Linux (Windows: use WSL2 or wait for Docker in Phase 4)
- Python 3.11+
- [Ollama](https://ollama.com) installed and running
- Git

### 1. Clone the repo

```bash
git clone https://github.com/yourusername/aistivus.git
cd aistivus
```

### 2. Create a virtual environment

```bash
python3 -m venv .venv
source .venv/bin/activate
```

### 3. Install dependencies

```bash
pip install -r requirements.txt
```

### 4. Pull a model

```bash
# Start Ollama if not already running
brew services start ollama

# Pull the recommended model (requires ~9GB disk)
ollama pull qwen2.5-coder:14b

# Or the lighter option (fits in 8GB VRAM)
ollama pull qwen2.5-coder:7b
```

### 5. Set up your config

```bash
cp templates/CONFIG_TEMPLATE.yaml config.yaml
# Edit config.yaml if needed — defaults work for most setups
```

### 6. Set up your job search context

```bash
cp templates/JOBSEARCH_TEMPLATE.md jobsearch.md
# Fill in jobsearch.md with your background, experience, and target role profile
# This is the AI's primary context for every evaluation — take time to fill it in well
```

### 7. Start the server

```bash
python3 main.py
```

### 8. Open your browser

```
http://localhost:8080
```

---

## Using the Tool

### Evaluating a Job Description

1. Go to **Evaluate** from the home page
2. Fill in company name, job title, location (optional)
3. Paste the full job description
4. Hit **Evaluate** (or `Cmd+Enter`)
5. Review the structured assessment: scores, fit type, strengths, gaps, and ATS keywords

### Reviewing Past Evaluations

Go to **Evaluations** to see all past evaluations with:
- Score, fit type, and recommendation at a glance
- Full detail panel with strengths, gaps, and keywords
- Inline report viewer

### Batch Processing via Inbox

Drop job description files into the `/inbox/` folder and run:

```bash
python3 evaluate.py
```

Files are processed and moved to `/inbox/done/`. Use the template at `templates/INBOX_TEMPLATE.md` for the correct format.

---

## Project Structure

```
aistivus/
├── main.py               FastAPI server — start here
├── database.py           All database logic and schema
├── evaluator.py          JD evaluation pipeline
├── evaluate.py           CLI inbox processor
├── llm_client.py         LLM abstraction (Ollama, Anthropic, OpenAI)
├── index.html            Landing page
├── evaluate.html         Evaluation UI
├── evaluations.html      Evaluation history
├── jobs.html             Jobs and opportunities view
├── templates/            Template files — copy, don't edit
│   ├── CONFIG_TEMPLATE.yaml
│   ├── JOBSEARCH_TEMPLATE.md
│   └── INBOX_TEMPLATE.md
├── config.yaml           Your working config (gitignored)
├── jobsearch.md          Your job search context (gitignored)
├── data/                 SQLite database (gitignored)
├── reports/              Markdown evaluation reports (gitignored)
└── inbox/                Drop JD files here for batch processing (gitignored)
```

---

## Configuration

Copy `templates/CONFIG_TEMPLATE.yaml` to `config.yaml`. Key settings:

| Setting | Default | Description |
|---|---|---|
| `ollama.base_url` | `http://localhost:11434` | Ollama server URL |
| `ollama.default_model` | `qwen2.5-coder:14b` | Default model for evaluations |
| `evaluation.min_score_threshold` | `6.0` | Minimum score to flag as a strong candidate |
| `app.host` | `127.0.0.1` | Bind address — do not change to `0.0.0.0` without a reverse proxy |
| `app.port` | `8080` | Server port |

---

## Security

AIstivus is designed as a local, single-user tool:

- Binds to `localhost` only by default — not accessible from the network
- All data stored locally in SQLite — nothing sent to external services unless you configure a cloud LLM provider
- API keys stored in `.env` only — never in the database or config files
- If you expose the port on your network (WSL2, bridged VM), use a reverse proxy with authentication (Traefik + Authelia recommended)

---

## Supported Platforms

| Platform | Status |
|---|---|
| macOS | ✅ Fully supported |
| Linux | ✅ Fully supported |
| Windows (WSL2) | ⚠️ Community supported |
| Windows (native) | ❌ Not supported — use WSL2 or wait for Docker (Phase 4) |

---

## Roadmap

| Phase | Status | Description |
|---|---|---|
| Phase 0 | ✅ Complete | Core evaluation pipeline, SQLite database, web UI |
| Phase 0.1 | ✅ Complete | Jobs page, re-evaluate with model picker, inbox CLI |
| Phase 1 | 🔄 Next | React/TypeScript frontend, application tracking, cloud LLM support |
| Phase 2 | Planned | Resume library, document generation, URL ingestion |
| Phase 3 | Planned | Job board scraping, repost detection, chat interface |
| Phase 4 | Planned | Docker, authentication, multi-project support |

Full specification: [PROJECT_SPEC.md](PROJECT_SPEC.md)

---

## Contributing

This project is in early development. Contributions welcome once Phase 1 is stable.

See [FEATURES.md](FEATURES.md) for the backlog of ideas.

---

## License

MIT — see [LICENSE](LICENSE)

---

## Legal

AIstivus scrapes publicly available job board data. Users are responsible for complying with each platform's Terms of Service. See [LEGAL_DISCLAIMER.md](LEGAL_DISCLAIMER.md).

AI-generated evaluations are advisory only. Always apply your own judgment before making application decisions.