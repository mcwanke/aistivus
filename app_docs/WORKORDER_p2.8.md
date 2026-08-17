# WORKORDER — Phase 2.8: CLI/API Hybrid Evaluation Testing

**Status:** Spec Complete (Implementation TBD)  
**Date:** 2026-08-17  
**Scope:** External Evaluation Workflow only (POC)  
**Version Lock:** v2.7 (no DB migrations, no version number changes)

---

## Overview

Enable cost-free development and testing of the job evaluation workflow by using Claude Code CLI (`claude -p`) as a local LLM backend in development environments, while supporting direct Anthropic API calls in production.

**Current workflow:** User manually generates eval prompt → copies to Claude browser → imports JSON result. Requires API calls or subscription usage.

**New workflow:** User clicks "Auto-Generate Eval w/ CLI/API" button → subprocess runs prompt via CLI/API → evaluation auto-imports. Cost-free in dev (subscription-based), paid per-token in prod (API-based).

**Key principle:** Same prompts, same import logic, different calling mechanism (CLI vs API). Environment-controlled via `AI_BACKEND` config setting.

---

## Scope & Limitations

### In Scope (Phase 2.8)
- External evaluation workflow automation only
- CLI subprocess approach for dev (`AI_BACKEND: cli`)
- API-ready structure for prod (`AI_BACKEND: api`)
- Research context validation (warn if missing)
- Timeout and error handling
- Context-specific error messages
- Comprehensive logging for debugging

### Out of Scope (Phase 2.9+)
- Research workflow automation
- Resume generation prompt automation (Pass 1, 2, 3)
- Cover letter generation automation
- Fully automated external evaluation (no manual review step)

---

## Implementation Plan

### 1. Prompt Update

**File:** `templates/prompts/eval_external.md`

**Change:** Add stricter JSON-only output instruction at end (before `EVALUATION_JSON_END`).

Current ending (line 174):
```
```
EVALUATION_JSON_END
```

New ending:
```
```
EVALUATION_JSON_END

⚠️ CRITICAL: Output ONLY the JSON block above within the EVALUATION_JSON_START/END markers.
Do not include narrative, explanation, summary, or any text outside these markers.
The application parses this programmatically — extraneous text will cause import failures.
```

**Impact:**
- Manual workflow (copy/paste): Unaffected. Frontend already extracts JSON between sentinels (ExternalEvalWorkflowModal.tsx:59-63).
- CLI workflow: Stricter output ensures clean subprocess parsing.
- No prompt logic changes; instruction clarity only.

---

### 2. Configuration

**File:** `user_data/config.yaml` and `templates/CONFIG_TEMPLATE.yaml`

**Add new top-level section:**

```yaml
# ─────────────────────────────────────
# AI Backend — Development vs. Production (Phase 2.8+)
# Controls whether evaluation workflows use Claude Code CLI (dev) or Anthropic API (prod).
# ─────────────────────────────────────
ai_backend:
  mode: cli  # Values: "cli" | "api" | "off"
             # - cli: use Claude Code CLI subprocess (cost-free dev, subscription-based)
             # - api: use Anthropic API directly (pay-per-token, production)
             # - off: disable auto-generation, manual import only
             # Default: cli (recommended for development)
```

**Behavior:**
- `mode: cli` → "Auto-Generate Eval" button enabled, uses subprocess
- `mode: api` → "Auto-Generate Eval" button enabled, uses API
- `mode: off` or missing → "Auto-Generate Eval" button disabled, manual workflow only

**Docker deployment:** Prod should set `mode: api` in mounted config.

---

### 3. Backend Route Changes

**File:** `main.py` — `/api/v1/applications/{application_id}/generate-prompt` route

**Current behavior:**
- Generates prompt text
- Returns prompt for manual import (human copy/paste to external LLM)

**New behavior:**
- Add query parameter: `?run_via_cli=true` (optional, default false)
- Check `config.ai_backend.mode` setting
- If `run_via_cli=true` and `mode in [cli, api]`:
  - Generate prompt (existing logic)
  - Subprocess call: `subprocess.run(["claude", "-p", prompt], timeout=60, ...)`
  - Parse JSON from response (extract between `EVALUATION_JSON_START`/`EVALUATION_JSON_END`)
  - Import evaluation directly via existing import endpoint
  - Return success response with evaluation ID
- If `run_via_cli=false` or `mode=off`:
  - Return prompt text (existing manual workflow)

**Error handling (all errors logged to app logs):**

| Scenario | Response | User Sees |
|----------|----------|-----------|
| Claude CLI not installed | 500 error | Modal: "Claude CLI not installed. Ensure `claude` is in PATH and run `claude login`." |
| Authentication expired | 500 error | Modal: "Claude CLI authentication expired. Run `claude login` to re-authenticate." |
| Subprocess timeout (60s) | 500 error | Modal: "Evaluation generation timed out. Try manual import or check CLI is responsive." |
| JSON parse failure | 500 error | Modal: "CLI returned malformed JSON. Check Claude's response format." |
| Import endpoint failure | 500 error | Modal: "Evaluation imported but failed to save. Error: [details]" |
| Success | 200 + eval ID | Modal auto-closes, evaluations auto-refresh |

**Pseudocode:**
```python
@app.post("/api/v1/applications/{application_id}/generate-prompt")
@limiter.limit("10/minute")
async def generate_prompt(request: Request, application_id: int, run_via_cli: bool = False):
    # Existing: fetch job, research, build prompt
    prompt = prompt_result["prompt_text"]
    
    if run_via_cli and config.ai_backend.mode in ["cli", "api"]:
        try:
            # Subprocess call with 60s timeout
            result = subprocess.run(
                ["claude", "-p", prompt],
                capture_output=True,
                text=True,
                timeout=60
            )
            if result.returncode != 0:
                logger.error(f"CLI error: {result.stderr}")
                raise HTTPException(500, f"CLI execution failed: {result.stderr}")
            
            # Extract JSON between sentinels
            output = result.stdout
            start_idx = output.find("EVALUATION_JSON_START")
            end_idx = output.find("EVALUATION_JSON_END")
            if start_idx == -1 or end_idx == -1:
                raise ValueError("Missing EVALUATION_JSON_START/END markers")
            
            json_str = output[start_idx + len("EVALUATION_JSON_START"):end_idx].strip()
            eval_json = json.loads(json_str)
            
            # Import via existing import logic
            import_result = database.add_evaluation(
                job_id=app_dict["job_id"],
                llm_model_id=<default_external_model_id>,
                **eval_json
            )
            logger.info(f"Auto-imported evaluation {import_result['id']} via CLI")
            
            return JSONResponse({
                "success": True,
                "mode": "cli",
                "evaluation_id": import_result["id"]
            })
        
        except subprocess.TimeoutExpired:
            logger.error("CLI subprocess timeout (60s)")
            raise HTTPException(500, "Evaluation generation timed out (60s)")
        except json.JSONDecodeError as e:
            logger.error(f"JSON parse failure: {e}")
            raise HTTPException(500, f"CLI returned malformed JSON: {e}")
        except Exception as e:
            logger.error(f"CLI auto-import failed: {e}")
            raise HTTPException(500, f"CLI error: {str(e)}")
    
    # Fallback: return prompt for manual import
    return JSONResponse({
        "success": True,
        "mode": "manual",
        "prompt": prompt
    })
```

---

### 4. Frontend Changes

**File:** `frontend/src/components/ApplyWorkflow.tsx`

**Add new state:**
```typescript
const [showAutoGenModal, setShowAutoGenModal] = useState(false)
const [autoGenLoading, setAutoGenLoading] = useState(false)
const [autoGenError, setAutoGenError] = useState('')
const aiBackendMode = settings?.ai_backend_mode // "cli" | "api" | "off" | null
```

**Add new button** (below "Open External Eval Workflow" button, around line 403):

```typescript
<div className="flex items-center gap-3">
  <button
    onClick={() => setShowAutoGenModal(true)}
    disabled={!["cli", "api"].includes(aiBackendMode || "")}
    className="px-3 py-1.5 text-xs font-mono text-text/70 border-2 border-surface2 rounded hover:text-text hover:border-accent/40 transition-colors disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
  >
    Auto-Generate Eval w/ CLI/API
  </button>
  <span className="text-xs font-mono text-muted">Run evaluation via {aiBackendMode || "disabled"}.</span>
</div>
```

**Add new modal component** (before closing `</div>` of ApplyWorkflow):

```typescript
{showAutoGenModal && (
  <AutoGenerateEvalModal
    jobId={jobId}
    applicationId={applicationId}
    aiBackendMode={aiBackendMode}
    onClose={() => {
      setShowAutoGenModal(false)
      setAutoGenError('')
    }}
  />
)}
```

**Create new modal component:** `frontend/src/components/AutoGenerateEvalModal.tsx`

```typescript
import { useState, useEffect } from 'react'
import { useJobResearch } from '@/hooks/useJobs'

interface AutoGenerateEvalModalProps {
  jobId: number
  applicationId: number
  aiBackendMode: string | null
  onClose: () => void
}

export function AutoGenerateEvalModal({
  jobId,
  applicationId,
  aiBackendMode,
  onClose,
}: AutoGenerateEvalModalProps): React.JSX.Element {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [showResearchWarning, setShowResearchWarning] = useState(false)
  const { data: research } = useJobResearch(jobId)

  // If no research, show warning first
  useEffect(() => {
    if (!loading && !research) {
      setShowResearchWarning(true)
    }
  }, [research, loading])

  async function handleContinue(): Promise<void> {
    setShowResearchWarning(false)
    setLoading(true)
    setError('')

    try {
      const response = await fetch(
        `/api/v1/applications/${applicationId}/generate-prompt?run_via_cli=true`,
        { method: 'POST' }
      )
      if (!response.ok) {
        const err = await response.json() as { detail?: string }
        throw new Error(err.detail || `HTTP ${response.status}`)
      }
      // Success: modal auto-closes after brief delay
      setTimeout(() => onClose(), 1000)
    } catch (err) {
      setError((err as Error).message)
      setLoading(false)
    }
  }

  // Research warning modal
  if (showResearchWarning) {
    return (
      <div className="fixed inset-0 bg-bg/80 flex items-center justify-center z-50 p-4">
        <div className="bg-surface rounded p-6 w-full max-w-md flex flex-col gap-4">
          <h2 className="font-serif text-accent text-lg">Research Missing</h2>
          <p className="text-xs font-mono text-muted">
            Research does not yet exist for this job. Without research context,
            evaluation scores will be based on job description signals only.
          </p>
          <div className="flex gap-2 justify-end">
            <button
              onClick={onClose}
              className="px-3 py-1.5 text-xs font-mono text-muted border border-surface2 rounded hover:text-text transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={() => void handleContinue()}
              className="px-3 py-1.5 text-xs font-mono text-bg bg-accent rounded hover:bg-accent/90"
            >
              Continue Without Research
            </button>
          </div>
        </div>
      </div>
    )
  }

  // Main auto-gen modal
  return (
    <div className="fixed inset-0 bg-bg/80 flex items-center justify-center z-50 p-4">
      <div className="bg-surface rounded p-6 w-full max-w-md flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h2 className="font-serif text-accent text-lg">
            {loading ? 'Generating Evaluation…' : 'Auto-Generate Evaluation'}
          </h2>
          <button
            onClick={onClose}
            disabled={loading}
            className="text-xs px-3 py-1.5 text-muted hover:text-text transition-colors disabled:opacity-50"
          >
            {loading ? '—' : 'Close'}
          </button>
        </div>

        {loading ? (
          <div className="py-8 text-center space-y-4">
            <div className="inline-block">
              <div className="w-8 h-8 border-2 border-accent/30 border-t-accent rounded-full animate-spin" />
            </div>
            <p className="text-xs font-mono text-muted">
              Running evaluation via {aiBackendMode}…
            </p>
          </div>
        ) : error ? (
          <div className="space-y-3">
            <p className="text-xs font-mono text-red bg-red/10 rounded p-3">
              {error}
            </p>
            <div className="text-xs font-mono text-muted">
              Try manual import or check that Claude CLI is installed and authenticated.
            </div>
          </div>
        ) : (
          <p className="text-xs font-mono text-muted">
            Click "Generate" to run the evaluation via {aiBackendMode}.
          </p>
        )}

        {/* Footer button row */}
        <div className="flex gap-2 justify-end pt-2 border-t border-surface2">
          <button
            onClick={onClose}
            disabled={loading}
            className="px-3 py-1.5 text-xs font-mono text-muted border border-surface2 rounded hover:text-text hover:border-accent/40 transition-colors disabled:opacity-50"
          >
            {loading ? 'Generating…' : 'Cancel'}
          </button>
          <button
            onClick={() => void handleContinue()}
            disabled={loading}
            className="px-3 py-1.5 text-xs font-mono text-bg bg-accent rounded hover:bg-accent/90 disabled:opacity-50"
          >
            {loading ? 'Generating…' : 'Generate'}
          </button>
        </div>
      </div>
    </div>
  )
}
```

**Connect to useSettings hook:**
- Query `GET /api/v1/settings` to fetch `ai_backend_mode`
- Update `useSettings` hook to include this field

---

### 5. Backend Route: Return Settings

**File:** `main.py` — `/api/v1/settings` endpoint

**Current behavior:** Returns various settings (external_default_model_id, etc.)

**Add to response:**
```json
{
  "external_default_model_id": 3,
  "ai_backend_mode": "cli"  // or "api" or "off"
}
```

---

## Testing Plan

### Prerequisites
1. Clone prod database + `app_data/` + `user_data/` to local dev environment
2. Ensure Claude CLI is installed: `which claude`
3. Verify authentication: `claude login` (if needed)
4. Set `config.yaml` `ai_backend.mode: cli`

### Test Cases

**1. Research context validation**
- [ ] Job WITH research: modal doesn't show warning, proceeds directly to generation
- [ ] Job WITHOUT research: warning modal shows "Research does not yet exist…"
  - [ ] Click "Cancel": modal closes, returns to ApplyWorkflow
  - [ ] Click "Continue": proceeds to generation despite missing research

**2. Successful CLI evaluation**
- [ ] Click "Auto-Generate Eval w/ CLI/API" button
- [ ] Modal shows "Generating Evaluation…" with spinner
- [ ] After ~10-20s: modal auto-closes
- [ ] Evaluation appears in eval scores section (auto-refreshed via React Query)
- [ ] Verify evaluation data matches expected JSON structure

**3. Timeout handling (60s)**
- [ ] Simulate subprocess hang (e.g., slow model)
- [ ] Wait 60s+
- [ ] Modal shows error: "Evaluation generation timed out (60s)"
- [ ] User can click "Cancel" to close modal
- [ ] User can click "Retry" or fallback to manual import

**4. CLI authentication failure**
- [ ] Run without valid Claude CLI auth
- [ ] Modal shows error: "Claude CLI authentication expired. Run `claude login`…"
- [ ] Verify error is logged to app logs

**5. JSON parse failure**
- [ ] Mock Claude returning non-JSON response
- [ ] Modal shows error: "CLI returned malformed JSON…"
- [ ] Verify error is logged to app logs

**6. Button enable/disable logic**
- [ ] `config.yaml` set `mode: cli` → button enabled
- [ ] `config.yaml` set `mode: api` → button enabled
- [ ] `config.yaml` set `mode: off` → button disabled
- [ ] `config.yaml` missing `ai_backend` section → button disabled

**7. Environment switching**
- [ ] Dev: `mode: cli` runs via subprocess ✓
- [ ] Prod: `mode: api` would call API (implementation TBD, but route structure ready)

---

## Deployment Notes

### Development (Local)
```yaml
# config.yaml
ai_backend:
  mode: cli  # Uses Claude Code CLI subprocess
```
- Claude CLI must be installed: `which claude`
- User must be authenticated: `claude login` (one-time)
- No API costs incurred during testing
- Token usage is a "black box" (subscription-based)

### Production (Docker)
```yaml
# config.yaml in Docker volume
ai_backend:
  mode: api  # Uses Anthropic API directly
```
- Requires `ANTHROPIC_API_KEY` in environment
- Pay-per-token model — log all token usage for cost tracking
- Recommended: integrate with cost monitoring dashboard
- Note: CLI subprocess approach not viable in containerized environment

### Migration Path
1. Develop/test locally with `mode: cli` (free)
2. Validate evaluation quality before API migration
3. Deploy to Docker with `mode: api` (pay-per-token)
4. Monitor costs via token logging

---

## Error Handling & Logging

**All errors logged to app logger with context:**

```python
logger.error(f"CLI auto-eval failed for app_id={application_id}, job_id={job_id}: {error_type}: {detail}")
```

**Error types to capture:**
- `subprocess.TimeoutExpired` → "Timeout (60s exceeded)"
- `subprocess.CalledProcessError` → CLI exit non-zero, capture stderr
- `json.JSONDecodeError` → JSON parse failure, log raw output
- `FileNotFoundError` → Claude CLI not in PATH
- `ConnectionError` → (future) API connection failures

**User-facing messages:**
- Generic but helpful; never expose stack traces
- Suggest troubleshooting steps (e.g., "Run `claude login`")
- Link to manual import as fallback

---

## Version & Compatibility

**Version lock:** v2.7 (no DB migrations, no schema changes, no version number bumps)

**Database:** No changes. All evaluation data stored in existing `evaluations` table via existing import endpoint.

**Backwards compatibility:** Manual "Open External Eval Workflow" remains unchanged. This feature is purely additive.

**Config format:** New `ai_backend` section is optional; app defaults to manual workflow if missing.

---

## Future Phases (Out of Scope)

**Phase 2.9:** Extend CLI automation to:
- Research workflow
- Resume generation (Pass 1, 2, 3)
- Cover letter generation

**Phase 2.10:** Full automation (no manual review):
- Auto-research + auto-eval in background
- Auto-import results
- Scheduled crawls with automatic evaluation

**Cost tracking:** Implement token-usage dashboard for API-based evals; CLI usage tracked as "estimated" based on prompt/response length.

---

## Acceptance Criteria

- [ ] Prompt updated with stricter JSON-only instruction
- [ ] Config template includes `ai_backend` section with documentation
- [ ] Backend route accepts `?run_via_cli=true` parameter
- [ ] Research context warning modal implemented and tested
- [ ] Auto-generate modal with loading state, error handling, 60s timeout
- [ ] Cancel button always visible and functional
- [ ] All errors logged to app logs with context
- [ ] Button enable/disable logic works for cli/api/off modes
- [ ] Manual workflow still works unchanged
- [ ] Testing plan complete with all cases passing
