import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useApplications } from '@/hooks/useApplications'
import { useModels } from '@/hooks/useEvaluate'
import ModelSelect from '@/components/ModelSelect'
import BatchEvalModal from '@/components/BatchEvalModal'
import AppHeader from '@/components/AppHeader'
import type { ApplicationListItem, ApplicationStatus } from '@/types/api'

// ─── Constants ────────────────────────────────────────────────────────────────

const ALL_STATUSES: ApplicationStatus[] = [
  'not-started', 'draft', 'skipped', 'applied', 'screening',
  'interview', 'offer', 'rejected', 'ghosted', 'withdrawn',
]

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  return iso.split('T')[0] ?? iso.slice(0, 10)
}

function fmtScore(val: number | null | undefined): string {
  if (val === null || val === undefined) return '—'
  return val.toFixed(1)
}

// ─── Status pill ──────────────────────────────────────────────────────────────

const STATUS_COLORS: Record<ApplicationStatus, string> = {
  'not-started': 'bg-surface2 text-muted',
  draft:         'bg-surface2 text-muted',
  skipped:       'bg-surface2 text-muted',
  applied:       'bg-accent/20 text-accent',
  screening:     'bg-accent/30 text-accent',
  interview:     'bg-green/20 text-green',
  offer:         'bg-green/30 text-green',
  rejected:      'bg-red/20 text-red',
  ghosted:       'bg-red/15 text-red',
  withdrawn:     'bg-surface2 text-muted',
}

function StatusPill({ status }: { status: ApplicationStatus }): React.JSX.Element {
  return (
    <span className={`text-xs font-mono px-2 py-0.5 rounded ${STATUS_COLORS[status] ?? 'bg-surface2 text-muted'}`}>
      {status}
    </span>
  )
}

// ─── Application row ──────────────────────────────────────────────────────────

interface AppRowProps {
  app: ApplicationListItem
  checked: boolean
  onToggle: (jobId: number) => void
  onNavigate: (jobId: number) => void
}

function AppRow({ app, checked, onToggle, onNavigate }: AppRowProps): React.JSX.Element {
  return (
    <div className="flex items-stretch border-b border-surface2 hover:bg-surface transition-colors">
      {/* Checkbox column — separate click target */}
      <label
        className="flex items-center justify-center px-4 cursor-pointer shrink-0"
        onClick={e => e.stopPropagation()}
      >
        <input
          type="checkbox"
          checked={checked}
          onChange={() => onToggle(app.job_id)}
          className="accent-accent w-3.5 h-3.5 cursor-pointer"
        />
      </label>

      {/* Row body — navigates to job detail */}
      <button
        onClick={() => onNavigate(app.job_id)}
        className="flex-1 text-left px-3 py-3 min-w-0"
      >
        <div className="flex items-center gap-2">
          <span className="font-sans font-medium text-text text-sm flex-1 truncate">
            {app.company_name}
          </span>
          <div className="flex items-center gap-1 shrink-0">
            <span className="text-[10px] font-mono text-muted uppercase">OVR</span>
            <span className="text-sm font-mono text-text">{fmtScore(app.agg_score_overall)}</span>
          </div>
        </div>
        <div className="flex items-center gap-2 mt-0.5">
          <span className="font-serif text-accent text-sm flex-1 truncate">{app.title}</span>
          <StatusPill status={app.application_status} />
        </div>
        {app.apply_date && (
          <div className="mt-0.5">
            <span className="text-xs text-muted">Applied {fmtDate(app.apply_date)}</span>
          </div>
        )}
      </button>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function Applications(): React.JSX.Element {
  const navigate = useNavigate()
  const { data: applications = [], isLoading, isError } = useApplications(true)
  const { data: models = [] } = useModels()

  const [activeStatuses, setActiveStatuses] = useState<Set<ApplicationStatus>>(
    new Set(ALL_STATUSES)
  )
  const [selectedJobIds, setSelectedJobIds] = useState<Set<number>>(new Set())
  const [selectedModelId, setSelectedModelId] = useState<number | null>(null)
  const [batchModalOpen, setBatchModalOpen] = useState(false)

  // Default model once models load
  useEffect(() => {
    if (models.length > 0 && selectedModelId === null) {
      const def = models.find(m => m.default_flag === 1) ?? models.find(m => m.available === 1)
      if (def) setSelectedModelId(def.id)
    }
  }, [models, selectedModelId])

  const visible = applications.filter(a => activeStatuses.has(a.application_status))

  // Deselect job_ids that are no longer in the visible set when filter changes
  useEffect(() => {
    const visibleIds = new Set(
      applications.filter(a => activeStatuses.has(a.application_status)).map(a => a.job_id)
    )
    setSelectedJobIds(prev => {
      const next = new Set([...prev].filter(id => visibleIds.has(id)))
      return next.size === prev.size ? prev : next
    })
  }, [activeStatuses, applications])

  function toggleStatus(s: ApplicationStatus): void {
    setActiveStatuses(prev => {
      const next = new Set(prev)
      if (next.has(s)) next.delete(s)
      else next.add(s)
      return next
    })
  }

  const toggleJob = useCallback((jobId: number) => {
    setSelectedJobIds(prev => {
      const next = new Set(prev)
      if (next.has(jobId)) next.delete(jobId)
      else next.add(jobId)
      return next
    })
  }, [])

  function toggleSelectAll(): void {
    if (selectedJobIds.size === visible.length && visible.length > 0) {
      setSelectedJobIds(new Set())
    } else {
      setSelectedJobIds(new Set(visible.map(a => a.job_id)))
    }
  }

  const selectedCount = selectedJobIds.size
  const allVisibleSelected = visible.length > 0 && selectedJobIds.size === visible.length

  const batchJobs = visible
    .filter(a => selectedJobIds.has(a.job_id))
    .map(a => ({ job_id: a.job_id, company_name: a.company_name, title: a.title }))

  const selectedModel = models.find(m => m.id === selectedModelId) ?? null

  return (
    <div className="flex flex-col h-screen">
      <AppHeader pageName="Applications" />

      {/* Page header */}
      <div className="px-4 py-3 border-b border-surface2 shrink-0">
        <h1 className="font-serif text-accent text-xl">Applications</h1>
        {!isLoading && (
          <p className="text-muted text-xs font-mono mt-0.5">
            {visible.length} of {applications.length} jobs
          </p>
        )}
      </div>

      {/* Status filter pills */}
      <div className="px-4 py-2 border-b border-surface2 flex flex-wrap gap-1.5 shrink-0">
        {ALL_STATUSES.map(s => (
          <button
            key={s}
            onClick={() => toggleStatus(s)}
            className={`text-[11px] font-mono px-2 py-0.5 rounded border transition-colors ${
              activeStatuses.has(s)
                ? `${STATUS_COLORS[s]} border-transparent`
                : 'bg-transparent text-muted border-surface2 opacity-40'
            }`}
          >
            {s}
          </button>
        ))}
      </div>

      {/* Batch action bar */}
      <div className="px-4 py-2 border-b border-surface2 flex items-center gap-3 shrink-0 bg-surface sticky top-0 z-10">
        <label className="flex items-center gap-2 cursor-pointer shrink-0">
          <input
            type="checkbox"
            checked={allVisibleSelected}
            onChange={toggleSelectAll}
            className="accent-accent w-3.5 h-3.5 cursor-pointer"
          />
          <span className="text-xs font-mono text-muted">Select all</span>
        </label>

        {selectedCount > 0 && (
          <span className="text-xs font-mono text-text shrink-0">{selectedCount} selected</span>
        )}

        <div className="flex-1" />

        <ModelSelect
          models={models}
          value={selectedModelId}
          onChange={setSelectedModelId}
          disabled={models.length === 0}
        />

        <button
          onClick={() => setBatchModalOpen(true)}
          disabled={selectedCount === 0 || selectedModelId === null}
          className="px-3 py-1.5 text-xs font-mono bg-accent text-bg rounded hover:bg-accent/80 transition-colors disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
        >
          Re-run Evals
        </button>
      </div>

      {/* Job list */}
      <div className="flex-1 overflow-y-auto">
        {isLoading && (
          <p className="text-muted text-sm p-4">Loading…</p>
        )}
        {isError && (
          <p className="text-red text-sm p-4">Failed to load jobs.</p>
        )}
        {!isLoading && !isError && visible.length === 0 && (
          <p className="text-muted text-sm p-4">No jobs match the current filters.</p>
        )}
        {visible.map(app => (
          <AppRow
            key={app.id}
            app={app}
            checked={selectedJobIds.has(app.job_id)}
            onToggle={toggleJob}
            onNavigate={jobId => navigate(`/jobs/${jobId}?tab=application`)}
          />
        ))}
      </div>

      {/* Batch eval modal */}
      {batchModalOpen && selectedModel && (
        <BatchEvalModal
          jobs={batchJobs}
          modelId={selectedModelId!}
          modelName={selectedModel.model}
          onClose={() => setBatchModalOpen(false)}
        />
      )}
    </div>
  )
}
