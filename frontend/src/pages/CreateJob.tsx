import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  useModels,
  useScrapeMutation,
  useFillGapsMutation,
  useCreateJobMutation,
} from '@/hooks/useEvaluate'
import AppHeader from '@/components/AppHeader'
import ModelSelect from '@/components/ModelSelect'

// ─── Success modal ────────────────────────────────────────────────────────────

function SuccessModal({
  jobId,
  onCreateAnother,
}: {
  jobId: number
  onCreateAnother: () => void
}): React.JSX.Element {
  const navigate = useNavigate()
  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
      <div className="bg-surface border border-surface2 rounded-xl p-8 max-w-sm w-full shadow-2xl text-center">
        <p className="font-serif text-accent text-lg mb-6">Job created successfully.</p>
        <div className="flex justify-center gap-3">
          <button
            onClick={() => navigate(`/jobs/${jobId}`)}
            className="px-5 py-2 text-sm font-sans bg-accent text-bg rounded hover:bg-accent/90 transition-colors"
          >
            Go To Job
          </button>
          <button
            onClick={onCreateAnother}
            className="px-5 py-2 text-sm font-sans bg-surface2 text-muted border border-surface2 rounded hover:text-text transition-colors"
          >
            Create Another Job
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function CreateJob(): React.JSX.Element {
  const [company, setCompany] = useState('')
  const [title, setTitle] = useState('')
  const [location, setLocation] = useState('')
  const [remoteType, setRemoteType] = useState('')
  const [applyUrl, setApplyUrl] = useState('')
  const [payBand, setPayBand] = useState('')
  const [jdText, setJdText] = useState('')
  const [selectedModelId, setSelectedModelId] = useState<number | null>(null)

  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [createdJobId, setCreatedJobId] = useState<number | null>(null)

  const [scrapeUrl, setScrapeUrl] = useState('')
  const [scrapeError, setScrapeError] = useState<string | null>(null)
  const [scrapeQuality, setScrapeQuality] = useState<'full' | 'partial' | null>(null)
  const [hasNullFieldsAfterScrape, setHasNullFieldsAfterScrape] = useState(false)

  const { data: models = [] } = useModels()
  const scrapeMutation = useScrapeMutation()
  const fillGapsMutation = useFillGapsMutation()
  const createJobMutation = useCreateJobMutation()

  useEffect(() => {
    if (models.length > 0 && selectedModelId === null) {
      const def = models.find((m) => m.default_flag === 1) ?? models[0]
      setSelectedModelId(def?.id ?? null)
    }
  }, [models, selectedModelId])

  function handleClear(): void {
    setCompany('')
    setTitle('')
    setLocation('')
    setRemoteType('')
    setApplyUrl('')
    setPayBand('')
    setJdText('')
    setErrorMsg(null)
    setCreatedJobId(null)
    setScrapeUrl('')
    setScrapeError(null)
    setScrapeQuality(null)
    setHasNullFieldsAfterScrape(false)
    if (models.length > 0) {
      const def = models.find((m) => m.default_flag === 1) ?? models[0]
      setSelectedModelId(def?.id ?? null)
    }
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
        llm_model_id: selectedModelId,
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

  async function handleCreate(): Promise<void> {
    if (!company.trim()) { setErrorMsg('Company name is required.'); return }
    if (!title.trim())   { setErrorMsg('Job title is required.'); return }
    setErrorMsg(null)
    try {
      const data = await createJobMutation.mutateAsync({
        company_name: company.trim(),
        title: title.trim(),
        location: location.trim() || undefined,
        remote_type: (remoteType as 'Remote' | 'Hybrid' | 'On-site') || undefined,
        apply_url: applyUrl.trim() || undefined,
        pay_band: payBand.trim() || undefined,
        description: jdText.trim() || undefined,
      })
      setCreatedJobId(data.job_id)
    } catch (err) {
      setErrorMsg(`Could not create job: ${(err as Error).message}`)
    }
  }

  const isPending = createJobMutation.isPending || scrapeMutation.isPending

  return (
    <div className="flex flex-col h-screen">
      <AppHeader pageName="Create Job" />
      <div className="flex flex-1 overflow-hidden">

        {/* ── Left column ─────────────────────────────────────────────── */}
        <div className="w-[300px] shrink-0 border-r border-surface2 flex flex-col overflow-y-auto">
          <div className="flex flex-col gap-4 p-5">

            {/* Model selector */}
            {models.length > 0 && (
              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-mono text-muted uppercase tracking-wider">Model</label>
                <ModelSelect
                  models={models}
                  value={selectedModelId}
                  onChange={setSelectedModelId}
                  disabled={isPending}
                />
              </div>
            )}

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
                  disabled={isPending}
                  className="flex-1 bg-surface border border-surface2 rounded px-3 py-2 text-sm font-mono text-text focus:outline-none focus:border-accent/50 disabled:opacity-50"
                />
                <button
                  onClick={() => void handleScrape()}
                  disabled={isPending || !scrapeUrl.trim()}
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
                  disabled={isPending || fillGapsMutation.isPending}
                  className="self-start px-3 py-1.5 text-xs font-mono bg-surface2 border border-surface2 text-muted rounded hover:text-text hover:border-accent/40 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {fillGapsMutation.isPending ? (
                    <span className="flex items-center gap-1.5">
                      <svg className="animate-spin w-3 h-3 shrink-0" viewBox="0 0 24 24" fill="none">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                      </svg>
                      Filling gaps…
                    </span>
                  ) : 'Fill gaps with AI'}
                </button>
              )}
            </div>

            <hr className="border-surface2" />

            {errorMsg && (
              <p className="text-xs font-mono text-red">{errorMsg}</p>
            )}

            {/* Actions */}
            <div className="flex items-center gap-2">
              <button
                onClick={() => void handleCreate()}
                disabled={isPending}
                className="px-5 py-2 bg-accent text-bg text-sm font-sans font-medium rounded hover:bg-accent/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {createJobMutation.isPending ? 'Creating…' : 'Create Job'}
              </button>
              <button
                onClick={handleClear}
                disabled={isPending}
                className="px-4 py-2 text-sm font-sans text-muted bg-surface2 border border-surface2 rounded hover:text-text transition-colors disabled:opacity-50"
              >
                Clear
              </button>
            </div>
          </div>
        </div>

        {/* ── Right column ─────────────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto p-5">
          <div className="flex flex-col gap-4 max-w-2xl">

            {/* Company + Title */}
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-mono text-muted uppercase tracking-wider">Company</label>
                <input
                  type="text"
                  value={company}
                  onChange={(e) => setCompany(e.target.value)}
                  placeholder="Acme Corp"
                  className="bg-surface border border-surface2 rounded px-3 py-2 text-sm font-sans text-text focus:outline-none focus:border-accent/50"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-mono text-muted uppercase tracking-wider">Job Title</label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Engineering Manager"
                  className="bg-surface border border-surface2 rounded px-3 py-2 text-sm font-sans text-text focus:outline-none focus:border-accent/50"
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
                  className="bg-surface border border-surface2 rounded px-3 py-2 text-sm font-sans text-text focus:outline-none focus:border-accent/50"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-mono text-muted uppercase tracking-wider">Work Type</label>
                <select
                  value={remoteType}
                  onChange={(e) => setRemoteType(e.target.value)}
                  className="bg-surface border border-surface2 rounded px-3 py-2 text-sm font-mono text-text focus:outline-none focus:border-accent/50"
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
                  className="bg-surface border border-surface2 rounded px-3 py-2 text-sm font-mono text-text focus:outline-none focus:border-accent/50"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-mono text-muted uppercase tracking-wider">Pay Band</label>
                <input
                  type="text"
                  value={payBand}
                  onChange={(e) => setPayBand(e.target.value)}
                  placeholder="e.g. $120k–$150k"
                  className="bg-surface border border-surface2 rounded px-3 py-2 text-sm font-mono text-text focus:outline-none focus:border-accent/50"
                />
              </div>
            </div>

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
                placeholder="Paste the full job description here…"
                rows={14}
                spellCheck={false}
                className="bg-surface border border-surface2 rounded px-3 py-2 text-sm font-mono text-muted focus:outline-none focus:border-accent/50 resize-y"
              />
            </div>

          </div>
        </div>

      </div>

      {/* ── Success modal ───────────────────────────────────────────────── */}
      {createdJobId !== null && (
        <SuccessModal
          jobId={createdJobId}
          onCreateAnother={handleClear}
        />
      )}
    </div>
  )
}
