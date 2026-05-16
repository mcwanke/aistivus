import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import type { StatsResponse, HealthResponse } from '@/types/api'
import { useProfileHealth } from '@/hooks/useProfileHealth'

// ─── Data fetchers ────────────────────────────────────────────────────────────

async function fetchStats(): Promise<StatsResponse> {
  const res = await fetch('/api/v1/stats')
  if (!res.ok) throw new Error(`stats ${res.status}`)
  return res.json() as Promise<StatsResponse>
}

async function fetchHealth(): Promise<HealthResponse> {
  const res = await fetch('/api/v1/health')
  if (!res.ok) throw new Error(`health ${res.status}`)
  return res.json() as Promise<HealthResponse>
}

// ─── Sub-components ───────────────────────────────────────────────────────────

interface StatCardProps {
  label: string
  value: number | string
  to?: string
}

function StatCard({ label, value, to }: StatCardProps): React.JSX.Element {
  const inner = (
    <>
      <span className="text-muted text-sm font-mono uppercase tracking-widest">{label}</span>
      <span className="text-accent font-serif text-4xl">{value}</span>
    </>
  )
  if (to) {
    return (
      <Link to={to} className="bg-surface rounded p-5 flex flex-col gap-1 hover:bg-surface2 transition-colors">
        {inner}
      </Link>
    )
  }
  return (
    <div className="bg-surface rounded p-5 flex flex-col gap-1">
      {inner}
    </div>
  )
}

function ModelBadge({ model, available }: { model: string; available: boolean }): React.JSX.Element {
  return (
    <div className="flex items-center gap-2 text-sm">
      <span className={`w-2 h-2 rounded-full ${available ? 'bg-green' : 'bg-red'}`} />
      <span className="font-mono text-text">{model}</span>
      <span className={`text-xs ${available ? 'text-green' : 'text-red'}`}>
        {available ? 'available' : 'unavailable'}
      </span>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

function ProfileStrengthWidget(): React.JSX.Element {
  const { data, isLoading } = useProfileHealth()

  if (isLoading) {
    return (
      <div className="bg-surface rounded p-5">
        <p className="text-muted text-sm font-mono uppercase tracking-widest text-xs mb-2">Job Search Profile</p>
        <p className="text-muted text-sm">Loading…</p>
      </div>
    )
  }

  if (!data || !data.file_exists) {
    return (
      <div className="bg-surface rounded p-5">
        <p className="text-muted font-mono uppercase tracking-widest text-xs mb-2">Job Search Profile</p>
        <Link to="/profile" className="text-sm text-accent hover:underline">
          Profile not set up — start here →
        </Link>
      </div>
    )
  }

  const { completed_sections, total_sections, completion_pct } = data
  const isComplete = completion_pct === 100

  return (
    <div className="bg-surface rounded p-5 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-muted font-mono uppercase tracking-widest text-xs">Job Search Profile</p>
        {isComplete && (
          <span className="text-xs font-mono text-green">Complete ✓</span>
        )}
      </div>
      {/* Progress bar */}
      <div className="flex gap-1">
        {Array.from({ length: total_sections }).map((_, i) => (
          <div
            key={i}
            className={`h-1.5 flex-1 rounded-full transition-colors ${
              i < completed_sections ? 'bg-accent' : 'bg-surface2'
            }`}
          />
        ))}
      </div>
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted">
          {completed_sections} of {total_sections} sections complete
        </p>
        <Link to="/profile" className="text-xs font-mono text-muted hover:text-accent transition-colors">
          {isComplete ? 'View →' : 'Complete your profile →'}
        </Link>
      </div>
    </div>
  )
}

export default function Dashboard(): React.JSX.Element {
  const stats = useQuery({ queryKey: ['stats'], queryFn: fetchStats })
  const health = useQuery({ queryKey: ['health'], queryFn: fetchHealth })

  return (
    <div className="h-full overflow-y-auto p-8 max-w-4xl mx-auto space-y-8">
      <h1 className="font-serif text-accent text-3xl">Dashboard</h1>

      {/* Stat cards */}
      <section>
        <h2 className="text-muted text-xs font-mono uppercase tracking-widest mb-3">Overview</h2>
        {stats.isLoading && (
          <p className="text-muted text-sm">Loading stats…</p>
        )}
        {stats.isError && (
          <p className="text-red text-sm">Failed to load stats.</p>
        )}
        {stats.data && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <StatCard label="Jobs"         value={stats.data.jobs}         to="/jobs" />
            <StatCard label="Evaluations"  value={stats.data.evaluations} />
            <StatCard label="Applications" value={stats.data.applications} to="/applications" />
            <StatCard label="LLM Calls"    value={stats.data.llm_calls} to="/llm-usage" />
          </div>
        )}
      </section>

      {/* Profile strength */}
      <section>
        <h2 className="text-muted text-xs font-mono uppercase tracking-widest mb-3">Profile</h2>
        <ProfileStrengthWidget />
      </section>

      {/* Model health */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-muted text-xs font-mono uppercase tracking-widest">Models</h2>
          <Link to="/settings" className="text-xs font-mono text-muted hover:text-accent transition-colors">
            Manage →
          </Link>
        </div>
        {health.isLoading && (
          <p className="text-muted text-sm">Checking models…</p>
        )}
        {health.isError && (
          <p className="text-red text-sm">Failed to load health status.</p>
        )}
        {health.data && (
          <div className="bg-surface rounded p-5 space-y-3">
            <div className="flex items-center gap-2 mb-2">
              <span
                className={`text-xs font-mono px-2 py-0.5 rounded ${
                  health.data.status === 'ok'
                    ? 'bg-green/20 text-green'
                    : 'bg-red/20 text-red'
                }`}
              >
                {health.data.status}
              </span>
              <span className="text-muted text-xs">schema v{health.data.database.schema_version}</span>
            </div>
            {health.data.models.length === 0 ? (
              <p className="text-muted text-sm">No models configured. Add one in Settings.</p>
            ) : (
              health.data.models.map((m) => (
                <ModelBadge key={m.id} model={m.model} available={m.available} />
              ))
            )}
          </div>
        )}
      </section>
    </div>
  )
}
