import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  useModels,
  useEvaluateMutation,
  useScrapeMutation,
  useFillGapsMutation,
  type EvaluatePayload,
} from '@/hooks/useEvaluate'
import { useActivateJob } from '@/hooks/useJobs'
import type { EvaluateResponse, ExistingJob } from '@/types/api'
import AppHeader from '@/components/AppHeader'

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
      <div className="flex items-start gap-4">
        <div>
          <p className="font-sans font-medium text-text text-sm">{company}</p>
          <p className="font-serif text-accent text-lg">{title}</p>
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

// ─── Activate CTA ─────────────────────────────────────────────────────────────

function ActivateCTA({
  recommendation,
  scoreOverall,
  onYes,
  onNo,
  isPending,
  error,
}: {
  recommendation: string | null
  scoreOverall: number | null
  onYes: () => void
  onNo: () => void
  isPending: boolean
  error: string | null
}): React.JSX.Element {
  const firstLine = recommendation
    ? `The overall recommendation for this job is: ${recommendation}`
    : 'Evaluation completed.'

  return (
    <div className="mx-6 mt-6 bg-accent/10 border border-accent/30 rounded-lg p-5 flex gap-6">
      <div className="flex-1 space-y-3">
        <p className="text-sm text-text font-sans">{firstLine}</p>
        <p className="text-sm text-muted font-sans">
          Would you like to start building the job and application information?
        </p>
        <div className="flex items-center gap-3">
          <button
            onClick={onYes}
            disabled={isPending}
            className="px-4 py-2 text-sm font-sans bg-accent text-bg rounded hover:bg-accent/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isPending ? 'Going to job…' : 'Yes, Go to Job'}
          </button>
          <button
            onClick={onNo}
            disabled={isPending}
            className="px-4 py-2 text-sm font-sans bg-surface2 text-muted border border-surface2 rounded hover:text-text transition-colors disabled:opacity-50"
          >
            No, Skip Job
          </button>
        </div>
        {error && (
          <p className="text-xs font-mono text-red">{error}</p>
        )}
        <p className="text-xs font-mono text-muted/60">
          You can always return to this evaluation in the Evaluations page if you change your mind.
        </p>
      </div>
      {scoreOverall !== null && (
        <div className="flex flex-col items-center justify-center shrink-0 border-l border-accent/20 pl-6 min-w-[100px]">
          <span className="font-mono text-[0.6rem] uppercase tracking-widest text-muted mb-1">Overall Score</span>
          <span className="font-mono text-5xl text-accent leading-none">{scoreOverall.toFixed(1)}</span>
          <span className="font-mono text-sm text-muted mt-1">/ 10</span>
        </div>
      )}
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
  const [payBand, setPayBand] = useState('')
  const [jdText, setJdText] = useState('')
  const [selectedModelId, setSelectedModelId] = useState<number | null>(null)

  const [panelState, setPanelState] = useState<PanelState>('idle')
  const [result, setResult] = useState<EvaluateResponse | null>(null)
  const [errorMsg, setErrorMsg] = useState('')

  const [elapsed, setElapsed] = useState(0)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const [dupJobs, setDupJobs] = useState<ExistingJob[]>([])
  const [pendingPayload, setPendingPayload] = useState<EvaluatePayload | null>(null)

  const [jobIsActive, setJobIsActive] = useState(false)
  const [activateError, setActivateError] = useState<string | null>(null)

  // ── Scrape state ────────────────────────────────────────────
  const [scrapeUrl, setScrapeUrl] = useState('')
  const [scrapeError, setScrapeError] = useState<string | null>(null)
  const [scrapeQuality, setScrapeQuality] = useState<'full' | 'partial' | null>(null)
  const [hasNullFieldsAfterScrape, setHasNullFieldsAfterScrape] = useState(false)

  const { data: models = [] } = useModels()
  const evaluateMutation = useEvaluateMutation()
  const scrapeMutation = useScrapeMutation()
  const fillGapsMutation = useFillGapsMutation()
  const activateJobMutation = useActivateJob()
  const navigate = useNavigate()

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
        setJobIsActive(false)
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
      pay_band: payBand.trim() || null,
      llm_model_id: selectedModelId,
      force: false,
    })
  }

  async function handleScrape(): Promise<void> {
    if (!scrapeUrl.trim()) return
    setScrapeError(null)
    setScrapeQuality(null)
    setHasNullFieldsAfterScrape(false)
    try {
      const data = await scrapeMutation.mutateAsync(scrapeUrl.trim())
      if (!data.success) {
        setScrapeError(data.error ?? 'Crawl4AI unavailable — enter fields manually')
        return
      }
      // pre-fill only fields the user hasn't already typed into
      if (data.title && !title) setTitle(data.title)
      if (data.company && !company) setCompany(data.company)
      if (data.location && !location) setLocation(data.location)
      if (data.remote_type && !remoteType) setRemoteType(data.remote_type)
      if (data.pay_band && !payBand) setPayBand(data.pay_band)
      if (data.jd_text && !jdText) setJdText(data.jd_text)
      if (data.apply_url && !applyUrl) setApplyUrl(data.apply_url)
      setScrapeQuality(data.scrape_quality)
      const nullCount = [data.title, data.company, data.location, data.remote_type, data.pay_band]
        .filter((v) => v === null).length
      setHasNullFieldsAfterScrape(nullCount > 0)
    } catch {
      setScrapeError('Crawl4AI unavailable — enter fields manually')
    }
  }

  async function handleFillGaps(): Promise<void> {
    setScrapeError(null)
    try {
      const data = await fillGapsMutation.mutateAsync({
        jd_text: jdText,
        title: title || null,
        company: company || null,
        location: location || null,
        remote_type: (remoteType as 'Remote' | 'Hybrid' | 'On-site') || null,
        pay_band: payBand || null,
      })
      if (data.error) {
        setScrapeError(data.error)
        return
      }
      if (data.title && !title) setTitle(data.title)
      if (data.company && !company) setCompany(data.company)
      if (data.location && !location) setLocation(data.location)
      if (data.remote_type && !remoteType) setRemoteType(data.remote_type)
      if (data.pay_band && !payBand) setPayBand(data.pay_band)
      setHasNullFieldsAfterScrape(false)
    } catch {
      setScrapeError('Fill gaps failed — please try again')
    }
  }

  function handleClear(): void {
    setCompany('')
    setTitle('')
    setLocation('')
    setRemoteType('')
    setApplyUrl('')
    setPayBand('')
    setJdText('')
    setResult(null)
    setErrorMsg('')
    setPanelState('idle')
    setJobIsActive(false)
    setActivateError(null)
    setScrapeUrl('')
    setScrapeError(null)
    setScrapeQuality(null)
    setHasNullFieldsAfterScrape(false)
    stopTimer()
    setElapsed(0)
    if (models.length > 0) {
      const def = models.find((m) => m.default_flag === 1) ?? models[0]
      setSelectedModelId(def.id)
    }
  }

  async function handleActivate(): Promise<void> {
    if (!result?.job_id) return
    setActivateError(null)
    try {
      await activateJobMutation.mutateAsync(result.job_id)
      setJobIsActive(true)
      navigate(`/jobs/${result.job_id}`)
    } catch {
      setActivateError('Failed to activate job — please try again.')
    }
  }

  function handleNoActivate(): void {
    handleClear()
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

  const isRunning = panelState === 'running'

  return (
    <div className="flex flex-col h-screen">
      <AppHeader pageName="Evaluate" />
      <div className="flex flex-1 overflow-hidden">
      {/* ── Left panel ──────────────────────────────────────────────── */}
      <div className="w-[460px] shrink-0 border-r border-surface2 flex flex-col overflow-y-auto">
        <div className="px-5 py-4 border-b border-surface2 flex items-center justify-between">
          <h1 className="font-serif text-accent text-xl">Evaluate</h1>
        </div>

        <div className="flex flex-col gap-4 p-5">
          {/* URL import */}
          <div className="flex flex-col gap-1.5">
            <label className="text-[10px] font-mono text-muted uppercase tracking-wider">
              Import from URL
            </label>
            <div className="flex gap-2">
              <input
                type="url"
                value={scrapeUrl}
                onChange={(e) => setScrapeUrl(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') void handleScrape() }}
                placeholder="https://…"
                disabled={isRunning || scrapeMutation.isPending}
                className="flex-1 bg-surface border border-surface2 rounded px-3 py-2 text-sm font-mono text-text focus:outline-none focus:border-accent/50 disabled:opacity-50"
              />
              <button
                onClick={() => void handleScrape()}
                disabled={isRunning || scrapeMutation.isPending || !scrapeUrl.trim()}
                className="px-3 py-2 text-xs font-mono bg-surface2 border border-surface2 text-muted rounded hover:text-text hover:border-accent/40 transition-colors disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
              >
                {scrapeMutation.isPending ? 'Importing…' : 'Import from URL'}
              </button>
            </div>
            {scrapeError && (
              <p className="text-xs font-mono text-red">{scrapeError}</p>
            )}
            {scrapeQuality === 'partial' && (
              <p className="text-xs font-mono text-accent/80 bg-accent/5 border border-accent/20 rounded px-2 py-1">
                Partial scrape — some fields may be incomplete. Review below.
              </p>
            )}
            {hasNullFieldsAfterScrape && (
              <button
                onClick={() => void handleFillGaps()}
                disabled={isRunning || fillGapsMutation.isPending}
                className="self-start px-3 py-1.5 text-xs font-mono bg-surface2 border border-surface2 text-muted rounded hover:text-text hover:border-accent/40 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {fillGapsMutation.isPending ? 'Filling gaps…' : 'Fill gaps with AI'}
              </button>
            )}
          </div>

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

          {/* Apply URL + Pay Band */}
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-mono text-muted uppercase tracking-wider">Apply URL</label>
              <input
                type="url"
                value={applyUrl}
                onChange={(e) => setApplyUrl(e.target.value)}
                placeholder="https://apply-link.com"
                disabled={isRunning}
                className="bg-surface border border-surface2 rounded px-3 py-2 text-sm font-mono text-text focus:outline-none focus:border-accent/50 disabled:opacity-50"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-mono text-muted uppercase tracking-wider">Pay Band</label>
              <input
                type="text"
                value={payBand}
                onChange={(e) => setPayBand(e.target.value)}
                placeholder="e.g. $120k–$150k"
                disabled={isRunning}
                className="bg-surface border border-surface2 rounded px-3 py-2 text-sm font-mono text-text focus:outline-none focus:border-accent/50 disabled:opacity-50"
              />
            </div>
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
                {Array.from(
                  [...models]
                    .sort((a, b) => {
                      const s = a.server_name.localeCompare(b.server_name)
                      return s !== 0 ? s : a.model.localeCompare(b.model)
                    })
                    .reduce<Map<string, typeof models>>((acc, m) => {
                      const g = acc.get(m.server_name) ?? []
                      g.push(m)
                      acc.set(m.server_name, g)
                      return acc
                    }, new Map())
                    .entries(),
                ).map(([serverName, serverModels]) => (
                  <optgroup key={serverName} label={serverName}>
                    {serverModels.map((m) => (
                      <option key={m.id} value={m.id} disabled={m.available !== 1}>
                        {m.model}
                        {m.default_flag === 1 ? ' (default)' : ''}
                        {m.available !== 1 ? ' (unavailable)' : ''}
                      </option>
                    ))}
                  </optgroup>
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
          <>
            {!jobIsActive && (
              <ActivateCTA
                recommendation={
                  (result.evaluation?.recommendation as string | null | undefined) ?? null
                }
                scoreOverall={
                  (result.evaluation?.score_overall as number | null | undefined) ?? null
                }
                onYes={() => void handleActivate()}
                onNo={handleNoActivate}
                isPending={activateJobMutation.isPending}
                error={activateError}
              />
            )}
            <ResultPanel
              result={result}
              company={company || 'Unknown Company'}
              title={title || 'Unknown Role'}
            />
          </>
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

    </div>
    </div>
  )
}
