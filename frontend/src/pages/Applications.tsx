import { useNavigate } from 'react-router-dom'
import { useApplications } from '@/hooks/useApplications'
import type { ApplicationListItem, ApplicationStatus } from '@/types/api'
import AppHeader from '@/components/AppHeader'

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
  onSelect: () => void
}

function AppRow({ app, onSelect }: AppRowProps): React.JSX.Element {
  return (
    <button
      onClick={onSelect}
      className="w-full text-left px-4 py-3 border-b border-surface2 transition-colors hover:bg-surface"
    >
      {/* Row 1: company + score */}
      <div className="flex items-center gap-2">
        <span className="font-sans font-medium text-text text-sm flex-1 truncate">
          {app.company_name}
        </span>
        <div className="flex items-center gap-1 shrink-0">
          <span className="text-[10px] font-mono text-muted uppercase">OVR</span>
          <span className="text-sm font-mono text-text">{fmtScore(app.agg_score_overall)}</span>
        </div>
      </div>

      {/* Row 2: title + status pill */}
      <div className="flex items-center gap-2 mt-0.5">
        <span className="font-serif text-accent text-sm flex-1 truncate">{app.title}</span>
        <StatusPill status={app.application_status} />
      </div>

      {/* Row 3: apply date + location */}
      <div className="flex items-center gap-3 mt-0.5">
        {app.apply_date && (
          <span className="text-xs text-muted">Applied {fmtDate(app.apply_date)}</span>
        )}
        {app.location && (
          <span className="text-xs text-muted truncate">📍 {app.location}</span>
        )}
      </div>
    </button>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function Applications(): React.JSX.Element {
  const navigate = useNavigate()
  const { data: applications, isLoading, isError } = useApplications()

  return (
    <div className="flex flex-col h-screen">
      <AppHeader pageName="Applications" />
      <div className="px-4 py-3 border-b border-surface2 shrink-0">
        <h1 className="font-serif text-accent text-xl">Applications</h1>
        {applications && (
          <p className="text-muted text-xs font-mono mt-0.5">{applications.length} active</p>
        )}
      </div>
      <div className="flex-1 overflow-y-auto">
        {isLoading && (
          <p className="text-muted text-sm p-4">Loading applications…</p>
        )}
        {isError && (
          <p className="text-red text-sm p-4">Failed to load applications.</p>
        )}
        {applications && applications.length === 0 && (
          <p className="text-muted text-sm p-4">
            No active applications yet. Start one from a job's detail page.
          </p>
        )}
        {applications &&
          applications.map((app) => (
            <AppRow
              key={app.id}
              app={app}
              onSelect={() => navigate(`/jobs/${app.job_id}?tab=application`)}
            />
          ))}
      </div>
    </div>
  )
}
