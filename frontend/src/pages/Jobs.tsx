import { useNavigate, useParams } from 'react-router-dom'
import { useJobs } from '@/hooks/useJobs'
import type { JobListItem, ApplicationStatus } from '@/types/api'
import JobDetail from '@/pages/JobDetail'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtScore(val: number | null | undefined): string {
  if (val === null || val === undefined) return '—'
  return val.toFixed(1)
}

// ─── Status pill ──────────────────────────────────────────────────────────────

const STATUS_COLORS: Record<ApplicationStatus, string> = {
  'not-started': 'bg-surface2 text-muted',
  draft:         'bg-surface2 text-muted',
  applied:       'bg-accent/20 text-accent',
  screening:     'bg-accent/30 text-accent',
  interview:     'bg-green/20 text-green',
  offer:         'bg-green/30 text-green',
  rejected:      'bg-red/20 text-red',
  ghosted:       'bg-red/15 text-red',
  withdrawn:     'bg-surface2 text-muted',
}

interface StatusPillProps {
  status: ApplicationStatus | null
}

function StatusPill({ status }: StatusPillProps): React.JSX.Element | null {
  if (!status || status === 'not-started') return null
  return (
    <span className={`text-xs font-mono px-2 py-0.5 rounded ${STATUS_COLORS[status] ?? 'bg-surface2 text-muted'}`}>
      {status}
    </span>
  )
}

// ─── Remote type pill ─────────────────────────────────────────────────────────

function RemotePill({ remoteType }: { remoteType: string | null }): React.JSX.Element | null {
  if (!remoteType) return null
  return (
    <span className="text-xs font-mono px-1.5 py-0.5 rounded bg-surface2 text-muted">
      {remoteType}
    </span>
  )
}

// ─── Score cell ───────────────────────────────────────────────────────────────

function ScoreCell({ label, value }: { label: string; value: number | null }): React.JSX.Element {
  const display = fmtScore(value)
  const hasScore = value !== null && value !== undefined
  return (
    <div className="flex flex-col items-center min-w-[36px]">
      <span className="text-[10px] font-mono text-muted uppercase">{label}</span>
      <span className={`text-sm font-mono ${hasScore ? 'text-text' : 'text-surface2'}`}>
        {display}
      </span>
    </div>
  )
}

// ─── Job row ──────────────────────────────────────────────────────────────────

interface JobRowProps {
  job: JobListItem
  selected: boolean
  onSelect: () => void
}

function JobRow({ job, selected, onSelect }: JobRowProps): React.JSX.Element {
  const isActive = job.application_status && job.application_status !== 'not-started'

  return (
    <button
      onClick={onSelect}
      className={`w-full text-left px-4 py-3 border-b border-surface2 transition-colors ${
        selected ? 'bg-surface2' : 'hover:bg-surface'
      }`}
    >
      {/* Row 1: company + scores + application button */}
      <div className="flex items-center gap-2">
        <span className="font-sans font-medium text-text text-sm flex-1 truncate">
          {job.company_name}
        </span>
        <div className="flex items-center gap-3 shrink-0">
          <ScoreCell label="R"   value={job.agg_role_fit} />
          <ScoreCell label="SC"  value={job.agg_scope_fit} />
          <ScoreCell label="CU"  value={job.agg_culture} />
          <ScoreCell label="CO"  value={job.agg_comp} />
          <ScoreCell label="OVR" value={job.agg_score_overall} />
        </div>
        <span
          className={`text-xs font-mono px-2 py-1 rounded shrink-0 ${
            isActive
              ? 'bg-accent/15 text-accent'
              : 'bg-surface2 text-muted'
          }`}
        >
          {isActive ? 'View →' : '+ Start'}
        </span>
      </div>

      {/* Row 2: title + status pill */}
      <div className="flex items-center gap-2 mt-0.5">
        <span className="font-serif text-accent text-sm flex-1 truncate">{job.title}</span>
        <StatusPill status={job.application_status} />
      </div>

      {/* Row 3: location + remote pill */}
      {(job.location || job.remote_type) && (
        <div className="flex items-center gap-2 mt-0.5">
          {job.location && (
            <span className="text-xs text-muted truncate">📍 {job.location}</span>
          )}
          <RemotePill remoteType={job.remote_type} />
        </div>
      )}
    </button>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function Jobs(): React.JSX.Element {
  const { jobId: jobIdParam } = useParams<{ jobId?: string }>()
  const selectedJobId = jobIdParam !== undefined ? parseInt(jobIdParam, 10) : undefined
  const navigate = useNavigate()

  const { data: jobs, isLoading, isError } = useJobs()

  function handleSelect(id: number): void {
    if (selectedJobId === id) {
      navigate('/jobs')
    } else {
      navigate(`/jobs/${id}`)
    }
  }

  return (
    <div className="flex h-full overflow-hidden">
      {/* ── Left panel ──────────────────────────────────────────────── */}
      <div className="w-[420px] shrink-0 border-r border-surface2 flex flex-col overflow-hidden">
        <div className="px-4 py-3 border-b border-surface2">
          <h1 className="font-serif text-accent text-xl">Jobs</h1>
          {jobs && (
            <p className="text-muted text-xs font-mono mt-0.5">{jobs.length} jobs</p>
          )}
        </div>

        <div className="flex-1 overflow-y-auto">
          {isLoading && (
            <p className="text-muted text-sm p-4">Loading jobs…</p>
          )}
          {isError && (
            <p className="text-red text-sm p-4">Failed to load jobs.</p>
          )}
          {jobs && jobs.length === 0 && (
            <p className="text-muted text-sm p-4">No jobs yet. Run an evaluation to add one.</p>
          )}
          {jobs &&
            jobs.map((job) => (
              <JobRow
                key={job.id}
                job={job}
                selected={selectedJobId === job.id}
                onSelect={() => handleSelect(job.id)}
              />
            ))}
        </div>
      </div>

      {/* ── Right panel ─────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto">
        {selectedJobId !== undefined ? (
          <JobDetail jobId={selectedJobId} />
        ) : (
          <div className="flex items-center justify-center h-full text-muted text-sm">
            Select a job to view details
          </div>
        )}
      </div>
    </div>
  )
}
