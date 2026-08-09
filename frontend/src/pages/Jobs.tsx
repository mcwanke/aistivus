import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useJobs } from '@/hooks/useJobs'
import type { JobListItem, ApplicationStatus } from '@/types/api'
import AppHeader from '@/components/AppHeader'

// ─── Types ────────────────────────────────────────────────────────────────────

type SortKey = 'score' | 'status' | 'staleness-overall' | 'staleness-status' | 'evals'
type SortDirection = 'asc' | 'desc'
type FilterKey = 'not-applied' | 'applied' | 'in-process' | 'closed-out'

// ─── Filter config ────────────────────────────────────────────────────────────

const FILTER_GROUPS: { key: FilterKey; label: string; statuses: string[] }[] = [
  { key: 'not-applied', label: 'Not Applied', statuses: ['not-started', 'draft'] },
  { key: 'applied',     label: 'Applied',     statuses: ['applied'] },
  { key: 'in-process',  label: 'In Process',  statuses: ['screening', 'interview', 'offer'] },
  { key: 'closed-out',  label: 'Closed Out',  statuses: ['skipped', 'rejected', 'ghosted', 'withdrawn'] },
]

const DEFAULT_FILTERS = new Set<FilterKey>(['not-applied', 'applied', 'in-process'])

// Session-persistent filter state — survives navigation within the same browser tab
let _sort: SortKey = 'score'
let _sortDir: SortDirection = 'desc'
let _filters: Set<FilterKey> = new Set(DEFAULT_FILTERS)
let _search = ''

// ─── Status config ────────────────────────────────────────────────────────────

const STATUS_ORDER: Record<string, number> = {
  interview:     0,
  offer:         1,
  screening:     2,
  applied:       3,
  draft:         4,
  'not-started': 5,
  skipped:       6,
  rejected:      7,
  ghosted:       8,
  withdrawn:     9,
}

function statusSortKey(status: ApplicationStatus | null): number {
  if (!status) return 99
  return STATUS_ORDER[status] ?? 99
}

function statusLabel(status: ApplicationStatus | null): string {
  if (!status || status === 'not-started') return ''
  return status.charAt(0).toUpperCase() + status.slice(1)
}

function statusClass(status: ApplicationStatus | null): string {
  if (!status || status === 'not-started') return 'text-muted border-surface2'
  if (status === 'interview' || status === 'offer') return 'text-green border-green'
  if (status === 'applied' || status === 'screening') return 'text-accent border-accent'
  if (status === 'skipped') return 'text-muted border-surface2'
  if (status === 'rejected' || status === 'ghosted' || status === 'withdrawn') return 'text-red border-red'
  return 'text-muted border-surface2'
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtScore(val: number | null | undefined): string {
  if (val === null || val === undefined) return '—'
  return val.toFixed(1)
}

function scoreColor(val: number | null | undefined): string {
  if (val === null || val === undefined) return 'text-muted'
  if (val >= 8) return 'text-green'
  if (val >= 6) return 'text-accent'
  return 'text-muted'
}

function stalenessLabel(days: number | null | undefined): string {
  if (days === null || days === undefined) return '—'
  return `${days}d`
}

function stalenessColor(days: number | null | undefined): string {
  if (days === null || days === undefined) return 'text-muted'
  if (days < 14) return 'text-blue-400'  // Fresh
  if (days < 30) return 'text-text'       // Aging (neutral)
  return 'text-orange-400'                // Stale
}

function stalenessTag(days: number | null | undefined): string {
  if (days === null || days === undefined) return '?'
  if (days < 14) return '✓'
  if (days < 30) return '⚠'
  return '⊘'
}

// ─── Job row ──────────────────────────────────────────────────────────────────

function JobRow({ job, onSelect }: { job: JobListItem; onSelect: () => void }): React.JSX.Element {
  const hasScore = job.agg_score_overall != null
  const statusText = statusLabel(job.application_status)
  const statusCls = statusClass(job.application_status)

  return (
    <button
      onClick={onSelect}
      className="w-full text-left border-b border-surface2 hover:bg-surface2 transition-colors"
    >
      <div className="flex items-stretch">

        {/* Score column — fixed width left anchor */}
        <div className="w-20 shrink-0 flex flex-col items-center justify-center border-r border-surface2 py-3">
          {hasScore ? (
            <>
              <span className={`font-serif text-2xl leading-none ${scoreColor(job.agg_score_overall)}`}>
                {fmtScore(job.agg_score_overall)}
              </span>
              <span className="text-[0.55rem] font-mono text-muted mt-0.5">/ 10</span>
            </>
          ) : (
            <span className="font-mono text-lg text-muted">—</span>
          )}
        </div>

        {/* Company/Title — flex-1 with max-width 450px */}
        <div className="flex-1 min-w-48 border-r border-surface2 px-3 py-2.5 flex flex-col justify-center" style={{ maxWidth: '450px' }}>
          <div className="text-[0.65rem] font-serif text-text">
            {job.company_name} - {job.title}
          </div>
          <div className="text-[0.58rem] font-mono text-muted mt-1">
            {job.location && <span>{job.location}</span>}
            {job.location && job.remote_type && <span> · </span>}
            {job.remote_type && <span>{job.remote_type}</span>}
          </div>
        </div>

        {/* Status — fixed width */}
        <div className="w-28 shrink-0 border-r border-surface2 px-2 py-2.5 flex items-center justify-center">
          {statusText ? (
            <span className={`text-[0.6rem] font-mono px-2 py-1 rounded-full border ${statusCls}`}>
              ● {statusText}
            </span>
          ) : (
            <span className="text-[0.58rem] font-mono text-muted">—</span>
          )}
        </div>

        {/* Eval count — fixed width with label */}
        <div className="w-14 shrink-0 border-r border-surface2 px-2 py-2.5 flex flex-col items-center justify-center">
          <span className="text-[0.5rem] font-mono text-muted uppercase">Evals</span>
          <span className="text-[0.7rem] font-mono text-text mt-0.5">
            {job.eval_count > 0 ? job.eval_count : '—'}
          </span>
        </div>

        {/* Scores — fixed width, restored label+value format */}
        <div className="w-40 shrink-0 border-r border-surface2 px-3 py-2.5 flex items-center">
          {hasScore ? (
            <div className="flex gap-2 flex-wrap">
              {[
                { label: 'Role',    val: job.agg_role_fit },
                { label: 'Scope',   val: job.agg_scope_fit },
                { label: 'Culture', val: job.agg_culture },
                { label: 'Comp',    val: job.agg_comp },
              ].map(({ label, val }) => (
                <span key={label} className="text-[0.55rem] font-mono text-muted">
                  {label} <span className="text-text font-semibold">{fmtScore(val)}</span>
                </span>
              ))}
            </div>
          ) : (
            <span className="text-[0.58rem] font-mono text-muted">—</span>
          )}
        </div>

        {/* Staleness pills — wider column */}
        <div className="w-64 shrink-0 px-3 py-2.5 flex items-center gap-2">
          {/* Overall staleness */}
          <span className={`text-[0.6rem] font-mono px-2 py-1 rounded border border-surface2 ${stalenessColor(job.staleness_days_overall)}`}>
            {stalenessTag(job.staleness_days_overall)} {stalenessLabel(job.staleness_days_overall)} Overall
          </span>
          {/* Status age */}
          <span className={`text-[0.6rem] font-mono px-2 py-1 rounded border border-surface2 ${stalenessColor(job.staleness_days_status)}`}>
            {stalenessTag(job.staleness_days_status)} {stalenessLabel(job.staleness_days_status)} State
          </span>
        </div>

      </div>
    </button>
  )
}

// ─── Toolbar ──────────────────────────────────────────────────────────────────

function Toolbar({
  sort, sortDir, onSort,
  activeFilters, onToggleFilter,
  searchTerm, onSearchChange,
}: {
  sort: SortKey; sortDir: SortDirection; onSort: (k: SortKey) => void
  activeFilters: Set<FilterKey>; onToggleFilter: (k: FilterKey) => void
  searchTerm: string; onSearchChange: (v: string) => void
}): React.JSX.Element {
  return (
    <div className="flex items-center gap-2 px-4 py-2 border-b border-surface2 shrink-0">
      <input
        type="text"
        value={searchTerm}
        onChange={(e) => onSearchChange(e.target.value)}
        placeholder="Search company or title…"
        className="w-48 bg-surface border border-surface2 rounded px-2.5 py-1 text-[0.72rem] font-mono text-text placeholder:text-muted/50 focus:outline-none focus:border-accent/50 mr-2"
      />
      <span className="text-[0.58rem] font-mono text-muted uppercase tracking-wider mr-1">Sort</span>
      {(['score', 'status', 'staleness-overall', 'staleness-status', 'evals'] as SortKey[]).map((key) => {
        const labels: Record<SortKey, string> = {
          score: 'Score',
          status: 'Status',
          'staleness-overall': 'Staleness - Overall',
          'staleness-status': 'Staleness - State',
          evals: 'Evals',
        }
        const isActive = sort === key
        const arrow = isActive ? (sortDir === 'desc' ? ' ↓' : ' ↑') : ''
        return (
          <button
            key={key}
            onClick={() => onSort(key)}
            className={`text-[0.62rem] font-mono px-2.5 py-1 rounded border transition-colors ${
              isActive ? 'border-accent text-accent' : 'border-surface2 text-muted hover:border-muted'
            }`}
          >
            {labels[key]}{arrow}
          </button>
        )
      })}

      <div className="ml-auto flex items-center gap-2">
        <span className="text-[0.58rem] font-mono text-muted uppercase tracking-wider mr-1">Filter</span>
        {FILTER_GROUPS.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => onToggleFilter(key)}
            className={`text-[0.62rem] font-mono px-2.5 py-1 rounded border transition-colors ${
              activeFilters.has(key) ? 'border-accent text-accent' : 'border-surface2 text-muted hover:border-muted'
            }`}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function Jobs(): React.JSX.Element {
  const navigate = useNavigate()
  const { data: jobs, isLoading, isError } = useJobs()
  const [sort, setSort] = useState<SortKey>(_sort)
  const [sortDir, setSortDir] = useState<SortDirection>(_sortDir)
  const [activeFilters, setActiveFilters] = useState<Set<FilterKey>>(_filters)
  const [searchTerm, setSearchTerm] = useState(_search)

  function handleSort(key: SortKey): void {
    if (_sort === key) {
      // Same key clicked: toggle direction
      _sortDir = _sortDir === 'desc' ? 'asc' : 'desc'
      setSortDir(_sortDir)
    } else {
      // Different key clicked: default to desc
      _sort = key
      _sortDir = 'desc'
      setSort(key)
      setSortDir(_sortDir)
    }
  }

  function handleSearchChange(val: string): void {
    _search = val
    setSearchTerm(val)
  }

  function toggleFilter(key: FilterKey): void {
    setActiveFilters(prev => {
      const next = new Set(prev)
      next.has(key) ? next.delete(key) : next.add(key)
      _filters = next
      return next
    })
  }

  const allowedStatuses = useMemo(() => {
    const statuses = new Set<string>()
    for (const group of FILTER_GROUPS) {
      if (activeFilters.has(group.key)) {
        group.statuses.forEach(s => statuses.add(s))
      }
    }
    return statuses
  }, [activeFilters])

  const visible = useMemo(() => {
    if (!jobs) return []
    const term = searchTerm.toLowerCase()
    const filtered = jobs.filter(j => {
      if (!allowedStatuses.has(j.application_status ?? 'not-started')) return false
      if (term && !j.company_name.toLowerCase().includes(term) && !j.title.toLowerCase().includes(term)) return false
      return true
    })
    return filtered.sort((a, b) => {
      let cmp = 0
      if (sort === 'score') {
        cmp = (b.agg_score_overall ?? -1) - (a.agg_score_overall ?? -1)
      } else if (sort === 'evals') {
        cmp = (b.eval_count ?? 0) - (a.eval_count ?? 0)
      } else if (sort === 'staleness-overall') {
        cmp = (a.staleness_days_overall ?? 999) - (b.staleness_days_overall ?? 999)
      } else if (sort === 'staleness-status') {
        cmp = (a.staleness_days_status ?? 999) - (b.staleness_days_status ?? 999)
      } else {
        // status sort
        cmp = statusSortKey(a.application_status) - statusSortKey(b.application_status)
      }
      return sortDir === 'asc' ? -cmp : cmp
    })
  }, [jobs, sort, sortDir, allowedStatuses, searchTerm])

  return (
    <div className="flex flex-col h-screen">
      <AppHeader pageName="Jobs" />
      <div className="px-4 py-3 border-b border-surface2 shrink-0 flex items-baseline gap-3">
        <h1 className="font-serif text-accent text-xl">Jobs</h1>
        {jobs && (
          <span className="text-muted text-[0.65rem] font-mono">{visible.length} of {jobs.length} jobs</span>
        )}
      </div>
      <Toolbar sort={sort} sortDir={sortDir} onSort={handleSort} activeFilters={activeFilters} onToggleFilter={toggleFilter} searchTerm={searchTerm} onSearchChange={handleSearchChange} />
      <div className="flex-1 overflow-y-auto">
        {isLoading && <p className="text-muted text-sm p-4">Loading jobs…</p>}
        {isError && <p className="text-red text-sm p-4">Failed to load jobs.</p>}
        {!isLoading && !isError && activeFilters.size === 0 && (
          <p className="text-muted text-sm p-4 text-center mt-8">No filters selected.</p>
        )}
        {!isLoading && !isError && activeFilters.size > 0 && jobs?.length === 0 && (
          <p className="text-muted text-sm p-4">No jobs yet.</p>
        )}
        {!isLoading && !isError && activeFilters.size > 0 && jobs && jobs.length > 0 && visible.length === 0 && (
          <p className="text-muted text-sm p-4">No jobs match the selected filters.</p>
        )}
        {visible.map((job) => (
          <JobRow key={job.id} job={job} onSelect={() => navigate(`/jobs/${job.id}`)} />
        ))}
      </div>
    </div>
  )
}
