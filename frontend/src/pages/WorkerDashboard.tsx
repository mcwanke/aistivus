import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import AppHeader from '@/components/AppHeader'
import { useWorkersByFilter, type Worker } from '@/hooks/useWorkers'
import { useJobDetail } from '@/hooks/useJobs'
import { useOrgDetail } from '@/hooks/useOrgs'

function formatRelativeTime(isoString: string): string {
  const date = new Date(isoString)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()

  // Handle negative differences (future dates or timezone issues)
  if (diffMs < 0) return 'just now'

  const seconds = Math.floor(diffMs / 1000)

  if (seconds < 60) return 'just now'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

function formatDuration(startedAt: string | null, completedAt: string | null, status: string): string {
  if (!startedAt) return '—'

  const start = new Date(startedAt)
  const end = completedAt ? new Date(completedAt) : new Date()

  const diffMs = end.getTime() - start.getTime()
  // Handle negative or zero differences
  if (diffMs <= 0) return '—'

  const totalSeconds = Math.floor(diffMs / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const secs = totalSeconds % 60

  if (status === 'running') {
    return `${minutes}m ${secs}s`
  }

  if (minutes === 0) return `${secs}s`
  return `${minutes}m ${secs}s`
}

function StatusBadge({ status }: { status: string }): React.JSX.Element {
  const colors: Record<string, string> = {
    pending: 'bg-surface2 text-muted',
    running: 'bg-accent/20 text-accent',
    completed: 'bg-green-400/20 text-green-400',
    failed: 'bg-red-400/20 text-red-400',
  }

  return (
    <span className={`px-2 py-1 text-xs font-mono rounded ${colors[status] || colors.pending}`}>
      {status}
    </span>
  )
}

function ErrorModal({
  error,
  workerId,
  onClose,
}: {
  error: string
  workerId: number
  onClose: () => void
}): React.JSX.Element {
  return (
    <div className="fixed inset-0 bg-bg/80 flex items-center justify-center z-50 p-4">
      <div className="bg-surface rounded p-6 w-full max-w-md flex flex-col gap-4 max-h-[80vh]">
        <div className="flex items-center justify-between">
          <h2 className="font-serif text-accent text-lg">Error — Worker {workerId}</h2>
          <button
            onClick={onClose}
            className="text-xs px-3 py-1.5 text-muted hover:text-text transition-colors"
          >
            Close
          </button>
        </div>
        <pre className="flex-1 overflow-y-auto text-xs font-mono text-red-400 bg-surface2 rounded p-4 whitespace-pre-wrap break-words leading-relaxed">
          {error}
        </pre>
      </div>
    </div>
  )
}

type FilterType = 'all' | 'today' | 'running' | 'errors' | 'completed' | 'unviewed'

export default function WorkerDashboard(): React.JSX.Element {
  const navigate = useNavigate()
  const [filter, setFilter] = useState<FilterType>('all')
  const [selectedError, setSelectedError] = useState<{ workerId: number; error: string } | null>(null)

  const { data: workers, isLoading, error: queryError } = useWorkersByFilter(filter)

  const filterButtons: Array<{ label: string; value: FilterType }> = [
    { label: 'All', value: 'all' },
    { label: 'Today', value: 'today' },
    { label: 'Unviewed', value: 'unviewed' },
    { label: 'Running', value: 'running' },
    { label: 'Errors', value: 'errors' },
    { label: 'Completed', value: 'completed' },
  ]

  function handleViewResult(worker: Worker): void {
    // Mark as viewed before navigating
    void fetch(`/api/v1/workers/${worker.id}/mark-viewed`, { method: 'POST' })
    navigate(worker.result_url)
  }

  return (
    <div className="flex flex-col min-h-screen bg-bg">
      <AppHeader pageName="Worker Dashboard" />

      <div className="flex-1 px-[5%] py-8">
        {/* Filters */}
        <div className="flex gap-3 mb-6">
          {filterButtons.map(btn => (
            <button
              key={btn.value}
              onClick={() => setFilter(btn.value)}
              className={`px-3 py-1.5 text-xs font-mono rounded transition-colors ${
                filter === btn.value
                  ? 'bg-accent text-bg'
                  : 'bg-surface2 text-muted hover:text-text border border-surface2'
              }`}
            >
              {btn.label}
            </button>
          ))}
        </div>

        {/* Table */}
        <div className="bg-surface rounded border border-surface2 overflow-hidden">
          {isLoading ? (
            <div className="p-8 text-center text-muted">Loading workers…</div>
          ) : queryError ? (
            <div className="p-8 text-center text-red-400">Failed to load workers</div>
          ) : workers && workers.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-xs font-mono">
                <thead>
                  <tr className="border-b border-surface2 bg-surface2">
                    <th className="px-2 py-3 text-center text-muted w-8">•</th>
                    <th className="px-4 py-3 text-left text-muted">ID</th>
                    <th className="px-4 py-3 text-left text-muted">Type</th>
                    <th className="px-4 py-3 text-left text-muted">Entity</th>
                    <th className="px-4 py-3 text-left text-muted">Status</th>
                    <th className="px-4 py-3 text-left text-muted">Queued</th>
                    <th className="px-4 py-3 text-left text-muted">Duration</th>
                    <th className="px-4 py-3 text-left text-muted">Error</th>
                    <th className="px-4 py-3 text-left text-muted">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {workers.map((worker, idx) => (
                    <WorkerTableRow
                      key={worker.id}
                      worker={worker}
                      idx={idx}
                      onViewResult={handleViewResult}
                      onShowError={(workerId, error) => setSelectedError({ workerId, error })}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="p-8 text-center text-muted">
              {filter === 'all'
                ? 'No workers yet. Queue an evaluation to get started!'
                : `No ${filter} workers.`}
            </div>
          )}
        </div>

        {/* Auto-refresh indicator */}
        {!isLoading && workers && workers.length > 0 && (
          <p className="text-xs font-mono text-muted/50 mt-4">Auto-refreshing every 10s…</p>
        )}
      </div>

      {/* Error Modal */}
      {selectedError && (
        <ErrorModal
          workerId={selectedError.workerId}
          error={selectedError.error}
          onClose={() => setSelectedError(null)}
        />
      )}
    </div>
  )
}

function WorkerTableRow({
  worker,
  idx,
  onViewResult,
  onShowError,
}: {
  worker: Worker
  idx: number
  onViewResult: (w: Worker) => void
  onShowError: (workerId: number, error: string) => void
}): React.JSX.Element {
  const { data: jobData } = useJobDetail(worker.entity_type === 'job' ? worker.entity_id : undefined)
  const { data: orgData } = useOrgDetail(worker.entity_type === 'org' ? worker.entity_id : undefined)
  const job = jobData?.job
  const org = orgData

  let entityDisplay = `${worker.entity_type} ${worker.entity_id}`
  if (worker.entity_type === 'job' && job) {
    entityDisplay = `${job.company_name} — ${job.title}`
  } else if (worker.entity_type === 'org' && org) {
    entityDisplay = org.name
  }

  return (
    <tr
      className={`border-b border-surface2 hover:bg-surface2/50 transition-colors ${
        idx % 2 === 0 ? 'bg-bg' : 'bg-surface/30'
      }`}
    >
      <td className="px-2 py-3 text-center text-accent">
        {worker.is_viewed === 0 ? '★' : ''}
      </td>
      <td className="px-4 py-3 text-muted">{worker.id}</td>
      <td className="px-4 py-3 text-text">{worker.worker_type}</td>
      <td className="px-4 py-3 text-text">{entityDisplay}</td>
      <td className="px-4 py-3">
        <StatusBadge status={worker.status} />
      </td>
      <td className="px-4 py-3 text-muted">{formatRelativeTime(worker.created_at)}</td>
      <td className="px-4 py-3 text-muted">
        {formatDuration(worker.started_at, worker.completed_at, worker.status)}
      </td>
      <td className="px-4 py-3">
        {worker.status === 'failed' && worker.error ? (
          <button
            onClick={() => onShowError(worker.id, worker.error!)}
            className="text-red-400 hover:text-red-300 transition-colors"
          >
            View Error
          </button>
        ) : (
          <span className="text-muted">—</span>
        )}
      </td>
      <td className="px-4 py-3">
        {worker.status === 'completed' || worker.status === 'failed' ? (
          <button
            onClick={() => onViewResult(worker)}
            className="text-accent hover:text-accent/80 transition-colors"
          >
            View Result →
          </button>
        ) : (
          <span className="text-muted">—</span>
        )}
      </td>
    </tr>
  )
}
