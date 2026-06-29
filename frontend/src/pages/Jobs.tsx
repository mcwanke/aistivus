import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useJobs } from '@/hooks/useJobs'
import type { JobListItem, ApplicationStatus } from '@/types/api'
import AppHeader from '@/components/AppHeader'

// ─── Types ────────────────────────────────────────────────────────────────────

type SortKey = 'score' | 'status'
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
        <div className="w-20 shrink-0 flex flex-col items-center justify-center border-r border-surface2 py-4">
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

        {/* Main content */}
        <div className="flex-1 min-w-0 px-4 py-3">
          {/* Company */}
          <div className="text-[0.6rem] font-mono tracking-widest uppercase text-muted mb-0.5">
            {job.company_name}
          </div>

          {/* Title */}
          <div className="font-serif text-text text-[0.95rem] leading-snug mb-2">
            {job.title}
          </div>

          {/* Meta: location · remote · status · eval count */}
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            {job.location && (
              <span className="text-[0.6rem] font-mono text-muted">📍 {job.location}</span>
            )}
            {job.remote_type && (
              <span className="text-[0.6rem] font-mono px-1.5 py-0.5 rounded border border-surface2 text-muted">
                {job.remote_type}
              </span>
            )}
            {statusText && (
              <span className={`text-[0.6rem] font-mono px-1.5 py-0.5 rounded-full border ${statusCls}`}>
                ● {statusText}
              </span>
            )}
            {job.eval_count > 0 ? (
              <span className="text-[0.6rem] font-mono px-1.5 py-0.5 rounded-full border border-surface2 bg-surface2 text-muted">
                {job.eval_count} eval{job.eval_count !== 1 ? 's' : ''}
              </span>
            ) : (
              <span className="text-[0.6rem] font-mono text-muted italic">not evaluated</span>
            )}
          </div>

          {/* Sub-scores */}
          {hasScore && (
            <div className="flex gap-3 mt-2">
              {[
                { label: 'Role',    val: job.agg_role_fit },
                { label: 'Scope',   val: job.agg_scope_fit },
                { label: 'Culture', val: job.agg_culture },
                { label: 'Comp',    val: job.agg_comp },
              ].map(({ label, val }) => (
                <span key={label} className="text-[0.58rem] font-mono text-muted">
                  {label} <span className="text-text">{fmtScore(val)}</span>
                </span>
              ))}
            </div>
          )}
        </div>

      </div>
    </button>
  )
}

// ─── Toolbar ──────────────────────────────────────────────────────────────────

function Toolbar({
  sort, onSort,
  activeFilters, onToggleFilter,
  searchTerm, onSearchChange,
}: {
  sort: SortKey; onSort: (k: SortKey) => void
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
      {(['score', 'status'] as SortKey[]).map((key) => (
        <button
          key={key}
          onClick={() => onSort(key)}
          className={`text-[0.62rem] font-mono px-2.5 py-1 rounded border transition-colors ${
            sort === key ? 'border-accent text-accent' : 'border-surface2 text-muted hover:border-muted'
          }`}
        >
          {key === 'score' ? 'Score' : 'Status'}
        </button>
      ))}

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
  const [activeFilters, setActiveFilters] = useState<Set<FilterKey>>(_filters)
  const [searchTerm, setSearchTerm] = useState(_search)

  function handleSort(key: SortKey): void {
    _sort = key
    setSort(key)
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
      if (sort === 'score') {
        return (b.agg_score_overall ?? -1) - (a.agg_score_overall ?? -1)
      }
      return statusSortKey(a.application_status) - statusSortKey(b.application_status)
    })
  }, [jobs, sort, allowedStatuses, searchTerm])

  return (
    <div className="flex flex-col h-screen">
      <AppHeader pageName="Jobs" />
      <div className="px-4 py-3 border-b border-surface2 shrink-0 flex items-baseline gap-3">
        <h1 className="font-serif text-accent text-xl">Jobs</h1>
        {jobs && (
          <span className="text-muted text-[0.65rem] font-mono">{visible.length} of {jobs.length} jobs</span>
        )}
      </div>
      <Toolbar sort={sort} onSort={handleSort} activeFilters={activeFilters} onToggleFilter={toggleFilter} searchTerm={searchTerm} onSearchChange={handleSearchChange} />
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
