import { useState, useEffect, useRef } from 'react'
import {
  useModels,
  useEvaluateMutation,
  useImportEvaluationMutation,
  type EvaluatePayload,
  type ImportPayload,
} from '@/hooks/useEvaluate'
import type { EvaluateResponse, ExistingJob, LlmModel } from '@/types/api'

// ─── Types ────────────────────────────────────────────────────────────────────

type PanelState = 'idle' | 'running' | 'result' | 'error'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fitTagClass(fitType: string | null): string {
  if (!fitType) return 'border-surface2 text-muted'
  const f = fitType.toLowerCase()
  if (f.includes('core')) return 'border-green text-green'
  if (f.includes('stretch')) return 'border-accent text-accent'
  if (f.includes('mismatch')) return 'border-red text-red'
  return 'border-surface2 text-muted'
}

function recTagClass(rec: string | null): string {
  if (!rec) return 'border-surface2 text-muted'
  const r = rec.toLowerCase()
  if (r.startsWith('apply with')) return 'bg-accent text-bg border-accent'
  if (r.startsWith('apply')) return 'bg-green text-bg border-green'
  if (r.startsWith('skip')) return 'bg-red text-white border-red'
  return 'border-surface2 text-muted'
}

function fmtElapsed(s: number): string {
  return `${s}s`
}

function fmtCountdown(remaining: number): string {
  return remaining <= 0 ? 'almost done…' : `~${remaining}s left`
}

// ─── Running panel ────────────────────────────────────────────────────────────

function RunningPanel({
  elapsed,
  countdown,
}: {
  elapsed: number
  countdown: number | null
}): React.JSX.Element {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-6">
      <div className="relative w-16 h-16">
        <div className="absolute inset-0 rounded-full border-2 border-accent/30 animate-ping" />
        <div className="absolute inset-2 rounded-full border-2 border-accent/60 animate-pulse" />
        <div className="absolute inset-4 rounded-full bg-accent/20" />
      </div>
      <div className="flex flex-col items-center gap-1">
        <p className="font-mono text-sm text-accent">Evaluating…</p>
        <p className="font-mono text-xs text-muted">{fmtElapsed(elapsed)}</p>
        {countdown !== null && (
          <p className="font-mono text-xs text-muted">{fmtCountdown(countdown)}</p>
        )}
      </div>
    </div>
  )
}

// ─── Score pill ───────────────────────────────────────────────────────────────

function ScorePill({
  label,
  value,
  denom,
}: {
  label: string
  value: number | null
  denom: number
}): React.JSX.Element {
  return (
    <div className="flex flex-col items-center bg-surface2 rounded p-3 gap-0.5">
      <span className="text-[10px] font-mono text-muted uppercase">{label}</span>
      <span className="font-mono text-lg text-text">
        {value !== null ? value.toFixed(1) : '—'}
      </span>
      <span className="text-[10px] font-mono text-muted">/{denom}</span>
    </div>
  )
}

// ─── Result panel ─────────────────────────────────────────────────────────────

function ResultPanel({
  result,
  company,
  title,
}: {
  result: EvaluateResponse
  company: string
  title: string
}): React.JSX.Element {
  const ev = result.evaluation ?? {}
  const get = <T,>(key: string): T | null => (ev[key] as T | undefined) ?? null

  const keywords: string[] =
    typeof get<string>('keywords') === 'string'
      ? (get<string>('keywords') as string).split(',').map((k) => k.trim()).filter(Boolean)
      : []

  const keywordGaps: string[] =
    typeof get<string>('keyword_gaps') === 'string'
      ? (get<string>('keyword_gaps') as string).split(',').map((k) => k.trim()).filter(Boolean)
      : []

  return (
    <div className="p-6 space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="font-sans font-medium text-text text-sm">{company}</p>
          <p className="font-serif text-accent text-lg">{title}</p>
        </div>
        <div className="flex flex-col items-center shrink-0">
          <span className="font-mono text-3xl text-accent">
            {get<number>('score_overall') !== null
              ? (get<number>('score_overall') as number).toFixed(1)
              : '—'}
          </span>
          <span className="font-mono text-xs text-muted">/10</span>
        </div>
      </div>

      {/* Sub-scores */}
      <div className="grid grid-cols-4 gap-2">
        <ScorePill label="Role"    value={get<number>('score_role_fit')}  denom={5} />
        <ScorePill label="Scope"   value={get<number>('score_scope_fit')} denom={5} />
        <ScorePill label="Culture" value={get<number>('score_culture')}   denom={5} />
        <ScorePill label="Comp"    value={get<number>('score_comp')}      denom={5} />
      </div>

      {/* Tags */}
      <div className="flex flex-wrap gap-2">
        <span className={`text-xs font-mono px-2 py-1 rounded border ${fitTagClass(get<string>('fit_type'))}`}>
          {get<string>('fit_type') ?? '—'}
        </span>
        <span className="text-xs font-mono px-2 py-1 rounded border border-surface2 text-muted">
          {get<string>('archetype') ?? '—'}
        </span>
        <span className={`text-xs font-mono px-2 py-1 rounded border ${recTagClass(get<string>('recommendation'))}`}>
          {get<string>('recommendation') ?? '—'}
        </span>
      </div>

      {/* Domain & role type match */}
      {(get<string>('domain_match') !== null || get<string>('role_type_match') !== null) && (
        <p className="text-xs font-mono text-muted">
          {[get<string>('domain_match'), get<string>('role_type_match')]
            .filter(Boolean)
            .join(' · ')}
        </p>
      )}

      {/* Strengths */}
      {get<string>('strengths') && (
        <div>
          <p className="text-[10px] font-mono text-muted uppercase tracking-wider mb-1">Strengths</p>
          <p className="text-sm text-muted/90 whitespace-pre-wrap leading-relaxed">
            {get<string>('strengths')}
          </p>
        </div>
      )}

      {/* Gaps */}
      {get<string>('gaps') && (
        <div>
          <p className="text-[10px] font-mono text-muted uppercase tracking-wider mb-1">Gaps & Concerns</p>
          <p className="text-sm text-muted/90 whitespace-pre-wrap leading-relaxed">
            {get<string>('gaps')}
          </p>
        </div>
      )}

      {/* Keywords */}
      {keywords.length > 0 && (
        <div>
          <p className="text-[10px] font-mono text-muted uppercase tracking-wider mb-2">
            Keywords for Tailoring
          </p>
          <div className="flex flex-wrap gap-1.5">
            {keywords.map((kw) => (
              <span
                key={kw}
                className="text-xs font-mono px-2 py-1 bg-surface2 border border-surface2 rounded text-muted hover:border-accent/40 hover:text-accent transition-colors cursor-default"
              >
                {kw}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Keyword gaps */}
      {keywordGaps.length > 0 && (
        <div>
          <p className="text-[10px] font-mono text-muted uppercase tracking-wider mb-2">
            Keyword Gaps
          </p>
          <div className="flex flex-wrap gap-1.5">
            {keywordGaps.map((kw) => (
              <span
                key={kw}
                className="text-xs font-mono px-2 py-1 bg-surface2 border border-red/30 rounded text-muted hover:border-red/60 transition-colors cursor-default"
              >
                {kw}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Duplicate modal ──────────────────────────────────────────────────────────

function DupModal({
  existingJobs,
  onCancel,
  onEvaluateAnyway,
}: {
  existingJobs: ExistingJob[]
  onCancel: () => void
  onEvaluateAnyway: () => void
}): React.JSX.Element {
  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
      <div className="bg-surface border border-surface2 rounded-xl p-7 max-w-md w-full shadow-2xl">
        <p className="font-serif text-accent text-lg mb-1">Potential Duplicate Found</p>
        <p className="text-sm text-muted mb-5 leading-relaxed">
          A job with the same company and title already exists. It may be a repost or the same listing.
        </p>
        <div className="space-y-2 mb-6">
          {existingJobs.map((job) => (
            <div key={job.id} className="bg-surface2 border border-surface2 rounded p-3 text-sm">
              <p className="text-text font-medium">
                {job.company_name} — {job.title}
              </p>
              <p className="text-muted text-xs mt-0.5">
                Added {job.first_seen_date?.slice(0, 10) ?? '—'} · Score{' '}
                {job.latest_score !== null ? job.latest_score.toFixed(1) : '—'}/10 ·{' '}
                {job.eval_count} eval{job.eval_count === 1 ? '' : 's'}
              </p>
            </div>
          ))}
        </div>
        <div className="flex justify-end gap-2">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-sm font-sans bg-surface2 text-muted border border-surface2 rounded hover:text-text transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onEvaluateAnyway}
            className="px-4 py-2 text-sm font-sans bg-accent text-bg rounded hover:bg-accent/90 transition-colors"
          >
            Evaluate Anyway
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Import modal ─────────────────────────────────────────────────────────────

function ImportModal({
  models,
  defaultModelId,
  onClose,
  onImport,
  importError,
  importing,
}: {
  models: LlmModel[]
  defaultModelId: number | null
  onClose: () => void
  onImport: (jobId: number, modelId: number | null, parsed: Record<string, unknown>) => void
  importError: string
  importing: boolean
}): React.JSX.Element {
  const [rawText, setRawText] = useState('')
  const [jobIdStr, setJobIdStr] = useState('')
  const [modelId, setModelId] = useState<number | null>(defaultModelId)
  const [parseError, setParseError] = useState('')

  function handleImport(): void {
    setParseError('')
    const jobId = parseInt(jobIdStr, 10)
    if (isNaN(jobId) || jobId <= 0) {
      setParseError('Enter a valid Job ID.')
      return
    }
    const start = rawText.indexOf('EVALUATION_JSON_START')
    const end = rawText.indexOf('EVALUATION_JSON_END')
    if (start === -1 || end === -1) {
      setParseError('Could not find EVALUATION_JSON_START / EVALUATION_JSON_END sentinels.')
      return
    }
    let parsed: Record<string, unknown>
    try {
      parsed = JSON.parse(
        rawText.slice(start + 'EVALUATION_JSON_START'.length, end).trim(),
      ) as Record<string, unknown>
    } catch (e) {
      setParseError(`JSON parse error: ${(e as Error).message}`)
      return
    }
    onImport(jobId, modelId, parsed)
  }

  const error = parseError || importError

  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
      <div className="bg-surface border border-surface2 rounded-xl p-7 max-w-lg w-full shadow-2xl flex flex-col gap-4">
        <div>
          <p className="font-serif text-accent text-lg mb-1">Import Claude Evaluation</p>
          <p className="text-xs text-muted leading-relaxed">
            Paste the full Claude response containing{' '}
            <span className="font-mono text-accent/70">
              EVALUATION_JSON_START … EVALUATION_JSON_END
            </span>
            .
          </p>
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-[10px] font-mono text-muted uppercase tracking-wider">Job ID</label>
          <input
            type="number"
            value={jobIdStr}
            onChange={(e) => setJobIdStr(e.target.value)}
            placeholder="e.g. 42"
            className="bg-surface2 border border-surface2 rounded px-3 py-2 text-sm font-mono text-text focus:outline-none focus:border-accent/50"
          />
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-[10px] font-mono text-muted uppercase tracking-wider">Model</label>
          <select
            value={modelId ?? ''}
            onChange={(e) =>
              setModelId(e.target.value ? parseInt(e.target.value, 10) : null)
            }
            className="bg-surface2 border border-surface2 rounded px-3 py-2 text-sm font-mono text-text focus:outline-none focus:border-accent/50"
          >
            <option value="">— default model —</option>
            {models.map((m) => (
              <option key={m.id} value={m.id}>
                {m.model}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-[10px] font-mono text-muted uppercase tracking-wider">
            Claude Response
          </label>
          <textarea
            value={rawText}
            onChange={(e) => setRawText(e.target.value)}
            placeholder="Paste the full response here…"
            rows={8}
            className="bg-surface2 border border-surface2 rounded px-3 py-2 text-xs font-mono text-text focus:outline-none focus:border-accent/50 resize-y"
          />
        </div>

        {error && <p className="text-xs font-mono text-red">{error}</p>}

        <div className="flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-sans bg-surface2 text-muted border border-surface2 rounded hover:text-text transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleImport}
            disabled={importing}
            className="px-4 py-2 text-sm font-sans bg-accent text-bg rounded hover:bg-accent/90 transition-colors disabled:opacity-50"
          >
            {importing ? 'Importing…' : 'Import'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function Evaluate(): React.JSX.Element {
  const [company, setCompany] = useState('')
  const [title, setTitle] = useState('')
  const [location, setLocation] = useState('')
  const [remoteType, setRemoteType] = useState('')
  const [applyUrl, setApplyUrl] = useState('')
  const [jdText, setJdText] = useState('')
  const [selectedModelId, setSelectedModelId] = useState<number | null>(null)

  const [panelState, setPanelState] = useState<PanelState>('idle')
  const [result, setResult] = useState<EvaluateResponse | null>(null)
  const [errorMsg, setErrorMsg] = useState('')

  const [elapsed, setElapsed] = useState(0)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const [dupJobs, setDupJobs] = useState<ExistingJob[]>([])
  const [pendingPayload, setPendingPayload] = useState<EvaluatePayload | null>(null)

  const [importOpen, setImportOpen] = useState(false)
  const [importError, setImportError] = useState('')

  const { data: models = [] } = useModels()
  const evaluateMutation = useEvaluateMutation()
  const importMutation = useImportEvaluationMutation()

  useEffect(() => {
    if (models.length > 0 && selectedModelId === null) {
      const def = models.find((m) => m.default_flag === 1) ?? models[0]
      setSelectedModelId(def.id)
    }
  }, [models, selectedModelId])

  function startTimer(): void {
    setElapsed(0)
    if (timerRef.current) clearInterval(timerRef.current)
    const start = Date.now()
    timerRef.current = setInterval(() => {
      setElapsed(Math.floor((Date.now() - start) / 1000))
    }, 500)
  }

  function stopTimer(): void {
    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }
  }

  useEffect(() => () => stopTimer(), [])

  const selectedModel = models.find((m) => m.id === selectedModelId) ?? null
  const estimatedTime = selectedModel?.estimated_eval_time ?? null
  const countdown = estimatedTime !== null ? Math.max(0, estimatedTime - elapsed) : null

  async function submitEvaluation(payload: EvaluatePayload): Promise<void> {
    setPanelState('running')
    setResult(null)
    startTimer()
    try {
      const data = await evaluateMutation.mutateAsync(payload)
      stopTimer()
      if (data.duplicate_detected) {
        setDupJobs(data.existing_jobs ?? [])
        setPendingPayload(payload)
        setPanelState('idle')
        return
      }
      if (data.success) {
        setResult(data)
        setPanelState('result')
      } else {
        setErrorMsg(data.error ?? 'Evaluation failed.')
        setPanelState('error')
      }
    } catch (err) {
      stopTimer()
      setErrorMsg(`Could not reach the server: ${(err as Error).message}`)
      setPanelState('error')
    }
  }

  async function handleEvaluate(): Promise<void> {
    if (!jdText.trim()) {
      setErrorMsg('Paste a job description before evaluating.')
      setPanelState('error')
      return
    }
    await submitEvaluation({
      jd_text: jdText.trim(),
      company_name: company.trim() || 'Unknown Company',
      job_title: title.trim() || 'Unknown Role',
      location: location.trim() || null,
      remote_type: remoteType || null,
      apply_url: applyUrl.trim() || null,
      llm_model_id: selectedModelId,
      force: false,
    })
  }

  function handleClear(): void {
    setCompany('')
    setTitle('')
    setLocation('')
    setRemoteType('')
    setApplyUrl('')
    setJdText('')
    setResult(null)
    setErrorMsg('')
    setPanelState('idle')
    stopTimer()
    setElapsed(0)
  }

  function handleDupCancel(): void {
    setPendingPayload(null)
    setDupJobs([])
    stopTimer()
    setPanelState('idle')
  }

  async function handleEvaluateAnyway(): Promise<void> {
    if (!pendingPayload) return
    const payload = { ...pendingPayload, force: true }
    setPendingPayload(null)
    setDupJobs([])
    await submitEvaluation(payload)
  }

  async function handleImport(
    jobId: number,
    modelId: number | null,
    parsed: Record<string, unknown>,
  ): Promise<void> {
    setImportError('')
    const payload: ImportPayload = {
      job_id: jobId,
      llm_model_id: modelId,
      score_overall: (parsed.score_overall as number | null) ?? null,
      score_role_fit: (parsed.score_role_fit as number | null) ?? null,
      score_scope_fit: (parsed.score_scope_fit as number | null) ?? null,
      score_culture: (parsed.score_culture as number | null) ?? null,
      score_comp: (parsed.score_comp as number | null) ?? null,
      fit_type: (parsed.fit_type as string | null) ?? null,
      archetype: (parsed.archetype as string | null) ?? null,
      strengths: (parsed.strengths as string | null) ?? null,
      gaps: (parsed.gaps as string | null) ?? null,
      recommendation: (parsed.recommendation as string | null) ?? null,
      keywords: (parsed.keywords as string | null) ?? null,
      domain_match: (parsed.domain_match as string | null) ?? null,
      role_type_match: (parsed.role_type_match as string | null) ?? null,
      keyword_gaps: (parsed.keyword_gaps as string | null) ?? null,
    }
    try {
      await importMutation.mutateAsync(payload)
      setImportOpen(false)
    } catch (err) {
      setImportError((err as Error).message)
    }
  }

  const isRunning = panelState === 'running'
  const defaultModelId = models.find((m) => m.default_flag === 1)?.id ?? null

  return (
    <div className="flex h-full overflow-hidden">
      {/* ── Left panel ──────────────────────────────────────────────── */}
      <div className="w-[460px] shrink-0 border-r border-surface2 flex flex-col overflow-y-auto">
        <div className="px-5 py-4 border-b border-surface2 flex items-center justify-between">
          <h1 className="font-serif text-accent text-xl">Evaluate</h1>
          <button
            onClick={() => { setImportOpen(true); setImportError('') }}
            className="text-xs font-mono text-muted hover:text-accent border border-surface2 px-2 py-1 rounded hover:border-accent/40 transition-colors"
          >
            Import Claude eval
          </button>
        </div>

        <div className="flex flex-col gap-4 p-5">
          {/* Company + Title */}
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-mono text-muted uppercase tracking-wider">Company</label>
              <input
                type="text"
                value={company}
                onChange={(e) => setCompany(e.target.value)}
                placeholder="Acme Corp"
                disabled={isRunning}
                className="bg-surface border border-surface2 rounded px-3 py-2 text-sm font-sans text-text focus:outline-none focus:border-accent/50 disabled:opacity-50"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-mono text-muted uppercase tracking-wider">Job Title</label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Engineering Manager"
                disabled={isRunning}
                className="bg-surface border border-surface2 rounded px-3 py-2 text-sm font-sans text-text focus:outline-none focus:border-accent/50 disabled:opacity-50"
              />
            </div>
          </div>

          {/* Location + Work Type */}
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-mono text-muted uppercase tracking-wider">Location</label>
              <input
                type="text"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="Remote"
                disabled={isRunning}
                className="bg-surface border border-surface2 rounded px-3 py-2 text-sm font-sans text-text focus:outline-none focus:border-accent/50 disabled:opacity-50"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-mono text-muted uppercase tracking-wider">Work Type</label>
              <select
                value={remoteType}
                onChange={(e) => setRemoteType(e.target.value)}
                disabled={isRunning}
                className="bg-surface border border-surface2 rounded px-3 py-2 text-sm font-mono text-text focus:outline-none focus:border-accent/50 disabled:opacity-50"
              >
                <option value="">— select —</option>
                <option value="Remote">Remote</option>
                <option value="Hybrid">Hybrid</option>
                <option value="On-site">On-site</option>
              </select>
            </div>
          </div>

          {/* Apply URL */}
          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-mono text-muted uppercase tracking-wider">Apply URL</label>
            <input
              type="url"
              value={applyUrl}
              onChange={(e) => setApplyUrl(e.target.value)}
              placeholder="https://…"
              disabled={isRunning}
              className="bg-surface border border-surface2 rounded px-3 py-2 text-sm font-mono text-text focus:outline-none focus:border-accent/50 disabled:opacity-50"
            />
          </div>

          {/* Model selector */}
          {models.length > 0 && (
            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-mono text-muted uppercase tracking-wider">Model</label>
              <select
                value={selectedModelId ?? ''}
                onChange={(e) =>
                  setSelectedModelId(e.target.value ? parseInt(e.target.value, 10) : null)
                }
                disabled={isRunning}
                className="bg-surface border border-surface2 rounded px-3 py-2 text-sm font-mono text-text focus:outline-none focus:border-accent/50 disabled:opacity-50"
              >
                {models.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.model}
                    {m.default_flag === 1 ? ' (default)' : ''}
                    {m.available === 0 ? ' — unavailable' : ''}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* JD textarea */}
          <div className="flex flex-col gap-1">
            <div className="flex items-center justify-between">
              <label className="text-[10px] font-mono text-muted uppercase tracking-wider">
                Job Description
              </label>
              <span className="text-[10px] font-mono text-muted">
                {jdText.length > 0 ? `${jdText.length.toLocaleString()} chars` : '0 chars'}
              </span>
            </div>
            <textarea
              value={jdText}
              onChange={(e) => setJdText(e.target.value)}
              onKeyDown={(e) => {
                if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') void handleEvaluate()
              }}
              placeholder="Paste the full job description here…"
              disabled={isRunning}
              rows={14}
              spellCheck={false}
              className="bg-surface border border-surface2 rounded px-3 py-2 text-sm font-mono text-muted focus:outline-none focus:border-accent/50 resize-y disabled:opacity-50"
            />
          </div>

          {/* Actions */}
          <div className="flex items-center gap-3">
            <button
              onClick={() => void handleEvaluate()}
              disabled={isRunning}
              className="px-5 py-2 bg-accent text-bg text-sm font-sans font-medium rounded hover:bg-accent/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isRunning ? 'Evaluating…' : 'Evaluate'}
            </button>
            <button
              onClick={handleClear}
              disabled={isRunning}
              className="px-4 py-2 text-sm font-sans text-muted bg-surface2 border border-surface2 rounded hover:text-text transition-colors disabled:opacity-50"
            >
              Clear
            </button>
            {isRunning && (
              <span className="font-mono text-xs text-muted">
                {fmtElapsed(elapsed)}
                {countdown !== null && ` · ${fmtCountdown(countdown)}`}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* ── Right panel ─────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto">
        {panelState === 'idle' && (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-center px-8">
            <span className="text-4xl text-muted/30 select-none">⚗</span>
            <p className="text-sm text-muted">Paste a job description and hit Evaluate.</p>
            <p className="text-xs font-mono text-muted/50">⌘+Enter to evaluate</p>
          </div>
        )}
        {panelState === 'running' && (
          <RunningPanel elapsed={elapsed} countdown={countdown} />
        )}
        {panelState === 'result' && result !== null && (
          <ResultPanel
            result={result}
            company={company || 'Unknown Company'}
            title={title || 'Unknown Role'}
          />
        )}
        {panelState === 'error' && (
          <div className="p-6">
            <div className="bg-red/5 border border-red/30 rounded-lg p-5">
              <p className="text-xs font-mono text-red uppercase tracking-wider mb-2">
                Evaluation Failed
              </p>
              <p className="text-sm text-muted">{errorMsg}</p>
            </div>
          </div>
        )}
      </div>

      {/* ── Duplicate modal ──────────────────────────────────────────── */}
      {dupJobs.length > 0 && (
        <DupModal
          existingJobs={dupJobs}
          onCancel={handleDupCancel}
          onEvaluateAnyway={() => void handleEvaluateAnyway()}
        />
      )}

      {/* ── Import modal ─────────────────────────────────────────────── */}
      {importOpen && (
        <ImportModal
          models={models}
          defaultModelId={defaultModelId}
          onClose={() => setImportOpen(false)}
          onImport={(jobId, modelId, parsed) => void handleImport(jobId, modelId, parsed)}
          importError={importError}
          importing={importMutation.isPending}
        />
      )}
    </div>
  )
}
