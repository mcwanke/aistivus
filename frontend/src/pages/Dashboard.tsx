import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import type { StatsResponse, HealthResponse } from '@/types/api'
import { useProfileHealth } from '@/hooks/useProfileHealth'
import AppHeader from '@/components/AppHeader'

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

function ProfileStrengthWidget(): React.JSX.Element {
  const { data, isLoading } = useProfileHealth()

  if (isLoading) {
    return (
      <div className="bg-surface rounded p-5">
        <p className="text-muted text-sm">Loading…</p>
      </div>
    )
  }

  if (!data || !data.file_exists) {
    return (
      <div className="bg-surface rounded p-5">
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
        {isComplete && <span className="text-xs font-mono text-green">Complete ✓</span>}
      </div>
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

// ─── Tile data ────────────────────────────────────────────────────────────────

const TOOLS_TILES = [
  {
    icon: '⚡',
    title: 'Create Job',
    description: 'Import a job listing from a URL or paste a description to add it to your job list.',
    to: '/createjob',
  },
  {
    icon: '📋',
    title: 'JS Profile',
    description: 'Build and refine your Job Search Profile — the context behind every evaluation.',
    to: '/profile',
  },
]

const DATA_TILES = [
  {
    icon: '📁',
    title: 'Applications',
    description: 'Track application status, add notes, and log recruiter conversations.',
    to: '/applications',
  },
  {
    icon: '📊',
    title: 'LLM Usage',
    description: 'View all LLM call logs, inspect prompts, and monitor usage by model.',
    to: '/llm-usage',
  },
]

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function Dashboard(): React.JSX.Element {
  const stats = useQuery({ queryKey: ['stats'], queryFn: fetchStats })
  const health = useQuery({ queryKey: ['health'], queryFn: fetchHealth })

  const statValue = (v: number | undefined) => (stats.isLoading || stats.isError || v === undefined ? '—' : v)

  return (
    <div className="min-h-screen bg-bg overflow-y-auto">
      <AppHeader />

      {/* Hero — two-column: featured Jobs tile (left) + hero text (right) */}
      <div className="px-12 pt-16 pb-12 flex gap-10 items-start max-w-5xl">
        {/* Featured Jobs tile */}
        <div className="w-72 flex-shrink-0">
          <Link
            to="/jobs"
            className="bg-surface border border-surface2 rounded-xl p-8 flex flex-col gap-3 hover:border-accent/30 hover:bg-surface2 hover:-translate-y-0.5 transition-all duration-200 h-full"
          >
            <span className="text-3xl leading-none">💼</span>
            <span className="font-serif text-2xl text-text tracking-tight leading-tight">
              Find Me My Ideal Job
            </span>
            <span className="text-[0.78rem] text-muted leading-snug">
              View all jobs and opportunities. Compare evaluations and re-evaluate top candidates.
            </span>
            <span className="mt-auto pt-3 border-t border-surface2 font-mono text-[0.62rem] uppercase tracking-wider text-green">
              ● Active
            </span>
          </Link>
        </div>

        {/* Hero text */}
        <div className="flex-1 pt-2">
          <p className="font-mono text-[0.65rem] uppercase tracking-[0.14em] text-accent/60 mb-4">
            PHASE 1.4 — SETTINGS IMPROVEMENTS + JOB LIFECYCLE
          </p>
          <h1 className="font-serif text-5xl leading-tight tracking-tight text-text mb-5">
            Because companies use AI to filter{' '}
            <em className="italic text-accent">you.</em>
          </h1>
          <p className="text-base text-muted leading-relaxed font-light max-w-lg">
            A local, private job search command center. Evaluate roles against your background,
            track applications, and build tailored resumes — powered by models running on your
            own machine.
          </p>
        </div>
      </div>

      {/* Stats bar */}
      <div className="mx-12 mb-12 border border-surface2 rounded-xl overflow-hidden flex">
        {/* Evaluations Run — no link */}
        <div className="flex-1 px-5 py-4 border-r border-surface2">
          <p className="font-serif text-accent text-3xl leading-none mb-1">{statValue(stats.data?.evaluations)}</p>
          <p className="font-mono text-[0.65rem] uppercase tracking-widest text-muted">Evaluations Run</p>
        </div>

        {/* Open Jobs */}
        <Link
          to="/jobs"
          className="flex-1 px-5 py-4 border-r border-surface2 hover:bg-surface transition-colors"
        >
          <p className="font-serif text-accent text-3xl leading-none mb-1">{statValue(stats.data?.jobs)}</p>
          <p className="font-mono text-[0.65rem] uppercase tracking-widest text-muted">Open Jobs</p>
        </Link>

        {/* Jobs Applied To */}
        <Link
          to="/applications"
          className="flex-1 px-5 py-4 border-r border-surface2 hover:bg-surface transition-colors"
        >
          <p className="font-serif text-accent text-3xl leading-none mb-1">{statValue(stats.data?.jobs_applied_to)}</p>
          <p className="font-mono text-[0.65rem] uppercase tracking-widest text-muted">Jobs Applied To</p>
        </Link>

        {/* Applications In Process */}
        <Link
          to="/applications"
          className="flex-1 px-5 py-4 hover:bg-surface transition-colors"
        >
          <p className="font-serif text-accent text-3xl leading-none mb-1">{statValue(stats.data?.applications_in_process)}</p>
          <p className="font-mono text-[0.65rem] uppercase tracking-widest text-muted">Applications In Process</p>
        </Link>
      </div>

      {/* Tools tiles */}
      <div className="px-12 pb-8">
        <p className="font-mono text-[0.65rem] uppercase tracking-widest text-muted/60 mb-5">Tools</p>
        <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-4 max-w-4xl">
          {TOOLS_TILES.map((tile) => (
            <Link
              key={tile.to}
              to={tile.to}
              className="bg-surface border border-surface2 rounded-xl p-6 flex flex-col gap-2.5 hover:border-accent/30 hover:bg-surface2 hover:-translate-y-0.5 transition-all duration-200"
            >
              <span className="text-2xl leading-none">{tile.icon}</span>
              <span className="font-serif text-xl text-text tracking-tight">{tile.title}</span>
              <span className="text-[0.78rem] text-muted leading-snug">{tile.description}</span>
              <span className="mt-auto pt-2 border-t border-surface2 font-mono text-[0.62rem] uppercase tracking-wider text-green">
                ● Active
              </span>
            </Link>
          ))}
        </div>
      </div>

      {/* Profile Strength */}
      <div className="px-12 pb-8">
        <p className="font-mono text-[0.65rem] uppercase tracking-widest text-muted/60 mb-5">Profile</p>
        <ProfileStrengthWidget />
      </div>

      {/* Data tiles */}
      <div className="px-12 pb-8">
        <p className="font-mono text-[0.65rem] uppercase tracking-widest text-muted/60 mb-5">Data</p>
        <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-4 max-w-4xl">
          {DATA_TILES.map((tile) => (
            <Link
              key={tile.to}
              to={tile.to}
              className="bg-surface border border-surface2 rounded-xl p-6 flex flex-col gap-2.5 hover:border-accent/30 hover:bg-surface2 hover:-translate-y-0.5 transition-all duration-200"
            >
              <span className="text-2xl leading-none">{tile.icon}</span>
              <span className="font-serif text-xl text-text tracking-tight">{tile.title}</span>
              <span className="text-[0.78rem] text-muted leading-snug">{tile.description}</span>
              <span className="mt-auto pt-2 border-t border-surface2 font-mono text-[0.62rem] uppercase tracking-wider text-green">
                ● Active
              </span>
            </Link>
          ))}
        </div>
      </div>

      {/* Model health */}
      <div className="px-12 pb-16">
        <div className="flex items-center justify-between mb-5">
          <p className="font-mono text-[0.65rem] uppercase tracking-widest text-muted/60">Models</p>
          <Link to="/settings" className="text-xs font-mono text-muted hover:text-accent transition-colors">
            Manage →
          </Link>
        </div>
        {health.isLoading && <p className="text-muted text-sm">Checking models…</p>}
        {health.isError && <p className="text-red text-sm">Failed to load health status.</p>}
        {health.data && (
          <div className="bg-surface rounded p-5 space-y-3">
            <div className="flex items-center gap-2 mb-2">
              <span
                className={`text-xs font-mono px-2 py-0.5 rounded ${
                  health.data.status === 'ok' ? 'bg-green/20 text-green' : 'bg-red/20 text-red'
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
      </div>
    </div>
  )
}
