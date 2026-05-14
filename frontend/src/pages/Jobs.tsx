import { useNavigate, useParams } from 'react-router-dom'
import { useJobs } from '@/hooks/useJobs'
import type { JobListItem } from '@/types/api'
import JobDetail from '@/pages/JobDetail'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtScore(val: number | null | undefined): string {
  if (val === null || val === undefined) return '—'
  return val.toFixed(1)
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
    <div className="flex flex-col items-center">
      <span className={`text-sm font-mono ${hasScore ? 'text-text' : 'text-muted'}`}>
        {display}
      </span>
      <span className="text-[10px] font-mono text-muted">{label}</span>
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
  return (
    <button
      onClick={onSelect}
      className={`w-full text-left px-4 py-3 border-b border-surface2 transition-colors ${
        selected ? 'bg-surface2' : 'hover:bg-surface'
      }`}
    >
      {/* Top: company (30%) + title/location stacked (70%) */}
      <div className="flex items-start gap-3">
        <span className="w-[30%] shrink-0 font-sans font-medium text-text text-sm truncate">
          {job.company_name}
        </span>
        <div className="flex-1 min-w-0">
          <div className="font-serif text-accent text-sm truncate">{job.title}</div>
          {(job.location || job.remote_type) && (
            <div className="flex items-center gap-2 mt-0.5">
              {job.location && (
                <span className="text-xs text-muted truncate">📍 {job.location}</span>
              )}
              <RemotePill remoteType={job.remote_type} />
            </div>
          )}
        </div>
      </div>

      {/* Rows 3–4: scores — value on top, label below */}
      <div className="flex justify-between mt-2">
        <ScoreCell label="Overall /10" value={job.agg_score_overall} />
        <ScoreCell label="Role /5"     value={job.agg_role_fit} />
        <ScoreCell label="Scope /5"    value={job.agg_scope_fit} />
        <ScoreCell label="Culture /5"  value={job.agg_culture} />
        <ScoreCell label="Comp /5"     value={job.agg_comp} />
      </div>
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
      <div className="w-[465px] shrink-0 border-r border-surface2 flex flex-col overflow-hidden">
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
