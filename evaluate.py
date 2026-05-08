"""
evaluate.py
───────────
CLI inbox processor for AIstivus.

Processes all .md and .txt files in the /inbox/ folder.
Each file is evaluated against jobsearch.md using the configured Ollama model.

File format: optional YAML frontmatter followed by JD text.

    ---
    company: Acme Corp
    title: Senior Engineering Manager
    location: Remote
    remote_type: Remote
    url: https://...
    date_posted: 2026-05-04
    notes: Found via LinkedIn
    ---
    [Full job description text here]

All frontmatter fields are optional. If omitted, fields default to
"Unknown Company" / "Unknown Role" and can be edited later in the UI.

On success: file moved to /inbox/done/
On failure: file moved to /inbox/failed/ with a .error.txt sidecar

Usage:
    python3 evaluate.py                  # process all files in /inbox/
    python3 evaluate.py --dry-run        # show what would be processed, no evaluation
    python3 evaluate.py --file path.md   # process a single specific file
"""

import argparse
import asyncio
import re
import shutil
import sys
from datetime import datetime, timezone
from pathlib import Path

import yaml

import database
import evaluator
import llm_client


# ─────────────────────────────────────────────────────────────
# Configuration
# ─────────────────────────────────────────────────────────────

def _load_config() -> dict:
    config_path = Path("config.yaml")
    if config_path.exists():
        with open(config_path) as f:
            return yaml.safe_load(f) or {}
    return {}


def _get_inbox_paths() -> tuple[Path, Path, Path]:
    """Return (inbox, done, failed) paths from config."""
    config = _load_config()
    inbox  = config.get("inbox", {})
    return (
        Path(inbox.get("path",       "./inbox")),
        Path(inbox.get("done_path",  "./inbox/done")),
        Path(inbox.get("failed_path","./inbox/failed")),
    )


def _get_ollama_config() -> tuple[str, str]:
    config = _load_config()
    ollama = config.get("ollama", {})
    return (
        ollama.get("base_url",      "http://localhost:11434"),
        ollama.get("default_model", "qwen2.5-coder:14b"),
    )


# ─────────────────────────────────────────────────────────────
# Frontmatter parsing
# ─────────────────────────────────────────────────────────────

def parse_inbox_file(file_path: Path) -> tuple[dict, str]:
    """
    Parse an inbox file into (frontmatter, jd_text).

    Frontmatter is optional YAML between --- markers at the top of the file.
    Everything after the second --- is treated as the job description text.

    If no frontmatter is present, the entire file content is the JD text.

    Returns:
        (frontmatter dict, jd_text string)
    """
    content = file_path.read_text(encoding="utf-8").strip()

    # Check for YAML frontmatter
    if content.startswith("---"):
        # Find the closing ---
        rest = content[3:]  # strip opening ---
        end  = rest.find("\n---")
        if end != -1:
            fm_raw  = rest[:end].strip()
            jd_text = rest[end + 4:].strip()  # skip \n---
            try:
                frontmatter = yaml.safe_load(fm_raw) or {}
                # Strip the template placeholder line if present
                if jd_text.startswith("[Paste the full"):
                    jd_text = ""
            except yaml.YAMLError:
                frontmatter = {}
            return frontmatter, jd_text

    # No frontmatter — entire content is JD
    return {}, content


# ─────────────────────────────────────────────────────────────
# Error sidecar
# ─────────────────────────────────────────────────────────────

def _write_error_sidecar(failed_dir: Path, filename: str, error: str) -> None:
    """
    Write a .error.txt sidecar file explaining why processing failed.
    Sidecars live alongside the failed file in /inbox/failed/.
    """
    sidecar_path = failed_dir / f"{filename}.error.txt"
    timestamp    = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
    sidecar_path.write_text(
        f"AIstivus Inbox Processing Error\n"
        f"{'─' * 40}\n"
        f"File:      {filename}\n"
        f"Timestamp: {timestamp}\n"
        f"{'─' * 40}\n\n"
        f"Error:\n{error}\n\n"
        f"Suggested fixes:\n"
        f"- Ensure the file contains a job description (not just frontmatter)\n"
        f"- Check that jobsearch.md exists in the project root\n"
        f"- Verify Ollama is running: brew services start ollama\n"
        f"- Check config.yaml for correct model name\n\n"
        f"To retry: fix the issue, then move the file back to /inbox/ and run evaluate.py again.\n"
    )


# ─────────────────────────────────────────────────────────────
# Process a single file
# ─────────────────────────────────────────────────────────────

async def process_file(
    file_path: Path,
    done_dir:  Path,
    failed_dir: Path,
    dry_run:   bool = False,
) -> dict:
    """
    Process a single inbox file.

    Returns {"success": bool, "score": float|None, "fit_type": str|None, "error": str|None}
    """
    filename = file_path.name
    print(f"\n  Processing: {filename}")

    # Parse frontmatter and JD text
    try:
        frontmatter, jd_text = parse_inbox_file(file_path)
    except Exception as e:
        error = f"Failed to read or parse file: {e}"
        print(f"  ✗ {error}")
        if not dry_run:
            shutil.move(str(file_path), str(failed_dir / filename))
            _write_error_sidecar(failed_dir, filename, error)
        return {"success": False, "score": None, "fit_type": None, "error": error}

    # Validate JD text exists
    if not jd_text.strip():
        error = (
            "File contains no job description text. "
            "Make sure JD text appears after the closing --- of the frontmatter, "
            "or remove the frontmatter entirely and paste the JD directly."
        )
        print(f"  ✗ {error}")
        if not dry_run:
            shutil.move(str(file_path), str(failed_dir / filename))
            _write_error_sidecar(failed_dir, filename, error)
        return {"success": False, "score": None, "fit_type": None, "error": error}

    # Extract fields from frontmatter
    company     = frontmatter.get("company")     or "Unknown Company"
    title       = frontmatter.get("title")       or "Unknown Role"
    location    = frontmatter.get("location")
    remote_type = frontmatter.get("remote_type")
    apply_url   = frontmatter.get("url")

    print(f"  Company:  {company}")
    print(f"  Title:    {title}")
    print(f"  Location: {location or '—'}")
    print(f"  JD chars: {len(jd_text):,}")

    if dry_run:
        print(f"  [dry-run] Would evaluate and move to /done/")
        return {"success": True, "score": None, "fit_type": None, "error": None}

    # Run evaluation
    try:
        result = await evaluator.evaluate_jd(
            jd_text=jd_text,
            company_name=company,
            job_title=title,
            location=location,
            remote_type=remote_type,
            apply_url=apply_url,
        )
    except Exception as e:
        error = f"Evaluation raised an exception: {type(e).__name__}: {e}"
        print(f"  ✗ {error}")
        shutil.move(str(file_path), str(failed_dir / filename))
        _write_error_sidecar(failed_dir, filename, error)
        return {"success": False, "score": None, "fit_type": None, "error": error}

    if result["success"]:
        ev       = result["evaluation"] or {}
        score    = ev.get("score_overall")
        fit_type = ev.get("fit_type")
        print(f"  ✓ Score: {score}/10 | {fit_type or '—'} | {ev.get('recommendation','—')}")
        print(f"  ✓ Report: {result.get('report_path','—')}")
        print(f"  ✓ Evaluation ID: {result.get('evaluation_id')}")
        shutil.move(str(file_path), str(done_dir / filename))
        return {"success": True, "score": score, "fit_type": fit_type, "error": None}
    else:
        # Evaluation ran but failed to parse — still recorded in DB
        error = result.get("error", "Unknown evaluation error")
        print(f"  ⚠ Evaluation recorded but parsing failed: {error}")
        print(f"  ⚠ Evaluation ID {result.get('evaluation_id')} preserved in database")
        # Move to done — it's in the DB, just with null scores
        shutil.move(str(file_path), str(done_dir / filename))
        return {"success": True, "score": None, "fit_type": None, "error": error}


# ─────────────────────────────────────────────────────────────
# Batch processor (used by API route and CLI)
# ─────────────────────────────────────────────────────────────

async def process_inbox_files(filenames: list[str] | None = None) -> dict:
    """
    Process inbox files by filename. Called by the API route.

    filenames: bare filenames residing in inbox/ root.
               If None, processes all pending .md/.txt files.

    Returns:
        {
            "succeeded": int,
            "failed":    int,
            "files":     [{"filename", "success", "score", "fit_type", "error"}]
        }
    """
    inbox_dir, done_dir, failed_dir = _get_inbox_paths()
    for d in [inbox_dir, done_dir, failed_dir]:
        d.mkdir(parents=True, exist_ok=True)

    if filenames is not None:
        resolved_inbox = inbox_dir.resolve()
        files = []
        for name in filenames:
            p = (inbox_dir / name).resolve()
            if not str(p).startswith(str(resolved_inbox)):
                raise ValueError(f"Invalid filename: {name}")
            files.append(inbox_dir / name)
    else:
        files = sorted([
            f for f in inbox_dir.iterdir()
            if f.is_file() and f.suffix in {".md", ".txt"}
            and f.parent == inbox_dir
        ])

    file_results = []
    succeeded    = 0
    failed       = 0

    for file_path in files:
        result = await process_file(file_path, done_dir, failed_dir)
        file_results.append({"filename": file_path.name, **result})
        if result["success"]:
            succeeded += 1
        else:
            failed += 1

    return {"succeeded": succeeded, "failed": failed, "files": file_results}


# ─────────────────────────────────────────────────────────────
# Main
# ─────────────────────────────────────────────────────────────

async def main(dry_run: bool = False, single_file: str | None = None) -> None:
    """Main entry point for inbox processing."""

    print("\nAIstivus — Inbox Processor")
    print("─" * 40)

    # Initialize database
    database.init_db()

    # Validate Ollama
    base_url, model = _get_ollama_config()
    print(f"  Checking Ollama at {base_url}...")
    health = await llm_client.check_ollama_health(base_url)

    if not health["reachable"]:
        print(f"\n✗ Cannot reach Ollama: {health['error']}")
        print("  Fix: run 'brew services start ollama' then try again.")
        sys.exit(1)

    if not llm_client.model_is_available(model, health["models"]):
        print(f"\n✗ Model '{model}' not available in Ollama.")
        print(f"  Available: {health['models']}")
        print(f"  Fix: run 'ollama pull {model}'")
        sys.exit(1)

    print(f"  ✓ Ollama ready — using {model}")

    # Set up inbox directories
    inbox_dir, done_dir, failed_dir = _get_inbox_paths()

    for d in [inbox_dir, done_dir, failed_dir]:
        d.mkdir(parents=True, exist_ok=True)

    # Collect files to process
    if single_file:
        target = Path(single_file)
        if not target.exists():
            print(f"\n✗ File not found: {single_file}")
            sys.exit(1)
        files = [target]
    else:
        files = sorted([
            f for f in inbox_dir.iterdir()
            if f.is_file() and f.suffix in {".md", ".txt"}
            and f.parent == inbox_dir  # only root of inbox, not done/ or failed/
        ])

    if not files:
        print(f"\n  No files found in {inbox_dir}/")
        print(f"  Drop .md or .txt files there and run again.")
        print(f"  Template: templates/INBOX_TEMPLATE.md")
        print("\n─" * 40)
        return

    print(f"\n  Found {len(files)} file{'s' if len(files) != 1 else ''} to process")
    if dry_run:
        print("  [DRY RUN — no evaluations will be run]")

    # Process files
    succeeded = 0
    failed    = 0

    for file_path in files:
        result = await process_file(file_path, done_dir, failed_dir, dry_run=dry_run)
        if result["success"]:
            succeeded += 1
        else:
            failed += 1

    # Summary
    print(f"\n{'─' * 40}")
    print(f"  Done: {succeeded} succeeded, {failed} failed")
    if succeeded > 0:
        print(f"  View results at http://localhost:8080/jobs")
    if failed > 0:
        print(f"  Failed files in: {failed_dir}/")
        print(f"  Check .error.txt sidecars for details")
    print()


# ─────────────────────────────────────────────────────────────
# Entry point
# ─────────────────────────────────────────────────────────────

if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="AIstivus inbox processor — evaluate JD files in /inbox/"
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Show what would be processed without running evaluations"
    )
    parser.add_argument(
        "--file",
        metavar="PATH",
        help="Process a single specific file instead of the whole inbox"
    )

    args = parser.parse_args()
    asyncio.run(main(dry_run=args.dry_run, single_file=args.file))