import { useQuery } from '@tanstack/react-query'
import type { StatsResponse, HealthResponse } from '@/types/api'

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
}

function StatCard({ label, value }: StatCardProps): React.JSX.Element {
  return (
    <div className="bg-surface rounded p-5 flex flex-col gap-1">
      <span className="text-muted text-sm font-mono uppercase tracking-widest">{label}</span>
      <span className="text-accent font-serif text-4xl">{value}</span>
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
            <StatCard label="Jobs" value={stats.data.jobs} />
            <StatCard label="Evaluations" value={stats.data.evaluations} />
            <StatCard label="Applications" value={stats.data.applications} />
            <StatCard label="LLM Calls" value={stats.data.llm_calls} />
          </div>
        )}
      </section>

      {/* Model health */}
      <section>
        <h2 className="text-muted text-xs font-mono uppercase tracking-widest mb-3">Models</h2>
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
