import { useState } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import AppHeader from '@/components/AppHeader'
import { useJobDetail, usePatchJob, useAddCompanyLog, useActivityLog } from '@/hooks/useJobs'
import { useApplicationDetail, usePatchLogTimestamp, usePatchAuditTimestamp } from '@/hooks/useApplications'
import { useImportEvaluationMutation, useModels, type ImportPayload } from '@/hooks/useEvaluate'
import { StatusBadge } from '@/utils/status'
import { fmtScore } from '@/utils/formatting'
import type {
  Evaluation,
  LlmModel,
  CompanyLogEntry,
  ApplicationStatus,
  Job,
  ActivityLogEntry,
} from '@/types/api'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  return iso.split('T')[0] ?? iso.slice(0, 10)
}

function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso)
  return isNaN(d.getTime()) ? iso : d.toLocaleString()
}

// ─── Tab type ─────────────────────────────────────────────────────────────────

type TabId = 'job-details' | 'application' | 'resume-cover' | 'interview' | 'application-log'

const TABS: { id: TabId; label: string }[] = [
  { id: 'job-details',     label: 'Job Details' },
  { id: 'application',     label: 'Application' },
  { id: 'resume-cover',    label: 'Resume / Cover' },
  { id: 'interview',       label: 'Interview' },
  { id: 'application-log', label: 'Application Log' },
]

// ─── WorkspaceSubHeader ───────────────────────────────────────────────────────

interface WorkspaceSubHeaderProps {
  job: Job
  appStatus: ApplicationStatus | null
  appLoading: boolean
}

function WorkspaceSubHeader({ job, appStatus, appLoading }: WorkspaceSubHeaderProps): React.JSX.Element {
  return (
    <div className="sticky top-[57px] z-10 bg-bg border-b border-surface2 px-6 py-3">
      <div className="flex items-start gap-8">
        {/* Score */}
        <div className="flex flex-col items-start shrink-0">
          <span className="font-serif text-4xl text-accent leading-none">
            {job.agg_score_overall != null ? fmtScore(job.agg_score_overall) : '—'}
          </span>
          <span className="font-mono text-xs text-muted">/ 10</span>
        </div>

        {/* Status + company */}
        <div className="flex flex-col gap-1 shrink-0">
          <span className="text-[10px] font-mono text-muted uppercase tracking-widest">Status</span>
          <div className="flex items-center gap-2">
            {appLoading ? (
              <span className="text-xs text-muted">—</span>
            ) : (
              <StatusBadge status={appStatus} />
            )}
          </div>
          <span className="text-sm text-muted">{job.company_name}</span>
        </div>

        {/* Title + location/remote */}
        <div className="flex flex-col gap-0.5 flex-1 min-w-0">
          <span className="font-serif text-lg text-text leading-tight">{job.title}</span>
          <span className="text-xs text-muted font-mono">
            {[job.location ? `📍 ${job.location}` : null, job.remote_type]
              .filter(Boolean)
              .join(' · ')}
          </span>
        </div>
      </div>
    </div>
  )
}

// ─── Collapsible section ──────────────────────────────────────────────────────

interface CollapsibleProps {
  title: string
  defaultOpen?: boolean
  children: React.ReactNode
}

function Collapsible({ title, defaultOpen = true, children }: CollapsibleProps): React.JSX.Element {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div>
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between py-2 text-left group"
      >
        <span className="text-muted text-xs font-mono uppercase tracking-widest group-hover:text-text transition-colors">
          {title}
        </span>
        <span className="text-muted text-xs">{open ? '▲' : '▼'}</span>
      </button>
      {open && <div>{children}</div>}
    </div>
  )
}

// ─── Edit Job Detail Modal ────────────────────────────────────────────────────

interface EditJobModalProps {
  jobId: number
  initial: { company_name: string; title: string; location: string | null; remote_type: string | null }
  onClose: () => void
}

function EditJobModal({ jobId, initial, onClose }: EditJobModalProps): React.JSX.Element {
  const [company, setCompany] = useState(initial.company_name)
  const [title, setTitle] = useState(initial.title)
  const [location, setLocation] = useState(initial.location ?? '')
  const [remoteType, setRemoteType] = useState(initial.remote_type ?? '')
  const patch = usePatchJob()

  async function handleSave(): Promise<void> {
    await patch.mutateAsync({
      jobId,
      updates: {
        company_name: company || undefined,
        title: title || undefined,
        location: location || undefined,
        remote_type: remoteType || undefined,
      },
    })
    onClose()
  }

  return (
    <div className="fixed inset-0 bg-bg/80 flex items-center justify-center z-50">
      <div className="bg-surface rounded p-6 w-full max-w-md space-y-4">
        <h2 className="font-serif text-accent text-lg">Edit Job</h2>
        <div className="space-y-3">
          <label className="block">
            <span className="text-muted text-xs font-mono uppercase tracking-widest">Company</span>
            <input
              className="mt-1 w-full bg-surface2 rounded px-3 py-2 text-text text-sm focus:outline-none focus:ring-1 focus:ring-accent"
              value={company}
              onChange={(e) => setCompany(e.target.value)}
            />
          </label>
          <label className="block">
            <span className="text-muted text-xs font-mono uppercase tracking-widest">Title</span>
            <input
              className="mt-1 w-full bg-surface2 rounded px-3 py-2 text-text text-sm focus:outline-none focus:ring-1 focus:ring-accent"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </label>
          <label className="block">
            <span className="text-muted text-xs font-mono uppercase tracking-widest">Location</span>
            <input
              className="mt-1 w-full bg-surface2 rounded px-3 py-2 text-text text-sm focus:outline-none focus:ring-1 focus:ring-accent"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
            />
          </label>
          <label className="block">
            <span className="text-muted text-xs font-mono uppercase tracking-widest">Remote type</span>
            <select
              className="mt-1 w-full bg-surface2 rounded px-3 py-2 text-text text-sm focus:outline-none focus:ring-1 focus:ring-accent"
              value={remoteType}
              onChange={(e) => setRemoteType(e.target.value)}
            >
              <option value="">—</option>
              <option>Remote</option>
              <option>Hybrid</option>
              <option>On-site</option>
            </select>
          </label>
        </div>
        <div className="flex justify-end gap-2 pt-1">
          <button
            onClick={onClose}
            className="px-4 py-1.5 text-sm text-muted hover:text-text transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={() => void handleSave()}
            disabled={patch.isPending}
            className="px-4 py-1.5 text-sm bg-accent text-bg rounded hover:bg-accent/90 disabled:opacity-50 transition-colors"
          >
            {patch.isPending ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Edit Description Modal ───────────────────────────────────────────────────

interface EditDescriptionModalProps {
  jobId: number
  initial: string
  onClose: () => void
}

function EditDescriptionModal({ jobId, initial, onClose }: EditDescriptionModalProps): React.JSX.Element {
  const [text, setText] = useState(initial)
  const patch = usePatchJob()

  async function handleSave(): Promise<void> {
    await patch.mutateAsync({ jobId, updates: { description_merged: text } })
    onClose()
  }

  return (
    <div className="fixed inset-0 bg-bg/80 flex items-center justify-center z-50">
      <div className="bg-surface rounded p-6 w-full max-w-2xl space-y-4">
        <h2 className="font-serif text-accent text-lg">Edit Description</h2>
        <textarea
          className="w-full h-64 bg-surface2 rounded px-3 py-2 text-text text-sm font-mono focus:outline-none focus:ring-1 focus:ring-accent resize-y"
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <div className="flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-4 py-1.5 text-sm text-muted hover:text-text transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={() => void handleSave()}
            disabled={patch.isPending}
            className="px-4 py-1.5 text-sm bg-accent text-bg rounded hover:bg-accent/90 disabled:opacity-50 transition-colors"
          >
            {patch.isPending ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── My Ratings section ───────────────────────────────────────────────────────

interface RatingInputProps {
  label: string
  value: number | null
  max: number
  onBlurSave: (val: number | null) => void
}

function RatingInput({ label, value, max, onBlurSave }: RatingInputProps): React.JSX.Element {
  const [local, setLocal] = useState(value !== null ? String(value) : '')

  function handleBlur(): void {
    const n = local === '' ? null : parseFloat(local)
    if (n !== null && (isNaN(n) || n < 0 || n > max)) return
    onBlurSave(n)
  }

  return (
    <div className="flex flex-col items-center gap-1">
      <span className="text-[10px] font-mono text-muted uppercase">{label}</span>
      <input
        type="number"
        min={0}
        max={max}
        step={0.1}
        value={local}
        onChange={(e) => setLocal(e.target.value)}
        onBlur={handleBlur}
        className="w-14 bg-surface2 rounded px-2 py-1 text-center text-sm font-mono text-text focus:outline-none focus:ring-1 focus:ring-accent"
        placeholder="—"
      />
      <span className="text-[10px] text-muted">/{max}</span>
    </div>
  )
}

// ─── Star rating ──────────────────────────────────────────────────────────────

interface StarRatingProps {
  value: number | null
  onChange: (val: number) => void
}

function StarRating({ value, onChange }: StarRatingProps): React.JSX.Element {
  const current = value !== null && value !== undefined ? value : 0
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((i) => (
        <button
          key={i}
          type="button"
          onClick={() => onChange(i)}
          className={`text-xl leading-none transition-all hover:scale-110 ${
            i <= current ? 'text-accent' : 'text-muted/30'
          }`}
        >
          ★
        </button>
      ))}
    </div>
  )
}

// ─── Edit ratings modal ───────────────────────────────────────────────────────

interface EditRatingsModalProps {
  jobId: number
  job: {
    my_role_fit: number | null
    my_scope_fit: number | null
    my_culture: number | null
    my_comp: number | null
    my_score_overall: number | null
  }
  onClose: () => void
}

function EditRatingsModal({ jobId, job, onClose }: EditRatingsModalProps): React.JSX.Element {
  const [rolefit, setRolefit] = useState(job.my_role_fit)
  const [scopefit, setScopefit] = useState(job.my_scope_fit)
  const [culture, setCulture] = useState(job.my_culture)
  const [comp, setComp] = useState(job.my_comp)
  const [overall, setOverall] = useState(job.my_score_overall)
  const patch = usePatchJob()

  async function handleSave(): Promise<void> {
    await patch.mutateAsync({
      jobId,
      updates: {
        my_role_fit: rolefit,
        my_scope_fit: scopefit,
        my_culture: culture,
        my_comp: comp,
        my_score_overall: overall,
      },
    })
    onClose()
  }

  return (
    <div className="fixed inset-0 bg-bg/80 flex items-center justify-center z-50">
      <div className="bg-surface rounded p-6 w-full max-w-md space-y-4">
        <h2 className="font-serif text-accent text-lg">My Ratings</h2>
        <div className="flex items-end gap-4 flex-wrap">
          <RatingInput label="Role"    value={rolefit}  max={5}  onBlurSave={setRolefit} />
          <RatingInput label="Scope"   value={scopefit} max={5}  onBlurSave={setScopefit} />
          <RatingInput label="Culture" value={culture}  max={5}  onBlurSave={setCulture} />
          <RatingInput label="Comp"    value={comp}     max={5}  onBlurSave={setComp} />
          <RatingInput label="Overall" value={overall}  max={10} onBlurSave={setOverall} />
        </div>
        <div className="flex justify-end gap-2 pt-1">
          <button
            onClick={onClose}
            className="px-4 py-1.5 text-sm text-muted hover:text-text transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={() => void handleSave()}
            disabled={patch.isPending}
            className="px-4 py-1.5 text-sm bg-accent text-bg rounded hover:bg-accent/90 disabled:opacity-50 transition-colors"
          >
            {patch.isPending ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}

interface MyRatingsSectionProps {
  jobId: number
  job: {
    my_role_fit: number | null
    my_scope_fit: number | null
    my_culture: number | null
    my_comp: number | null
    my_score_overall: number | null
    excitement_level: string | null
  }
}

function MyRatingsSection({ jobId, job }: MyRatingsSectionProps): React.JSX.Element {
  const patch = usePatchJob()
  const [editOpen, setEditOpen] = useState(false)

  const excitementVal = job.excitement_level !== null ? parseInt(job.excitement_level, 10) : null
  const excitementNum = !isNaN(excitementVal ?? NaN) ? excitementVal : null

  function fmtRating(val: number | null, max: number): string {
    if (val === null || val === undefined) return '—'
    return `${val.toFixed(1)} /${max}`
  }

  return (
    <>
      <div className="grid grid-cols-[25%_1fr] gap-6">
        <div className="flex flex-col items-center">
          <p className="text-[10px] font-mono text-muted uppercase tracking-widest mb-2">Excitement</p>
          <StarRating
            value={excitementNum}
            onChange={(val) => {
              patch.mutate({ jobId, updates: { excitement_level: String(val) } })
            }}
          />
        </div>

        <div className="flex flex-col items-center">
          <p className="text-[10px] font-mono text-muted uppercase tracking-widest mb-2">My Ratings</p>
          <div className="flex items-center gap-4 flex-wrap justify-center">
            {([
              ['Role',    job.my_role_fit,      5],
              ['Scope',   job.my_scope_fit,     5],
              ['Culture', job.my_culture,       5],
              ['Comp',    job.my_comp,          5],
              ['Overall', job.my_score_overall, 10],
            ] as [string, number | null, number][]).map(([label, val, max]) => (
              <div key={label} className="flex flex-col items-center">
                <span className="text-[10px] font-mono text-muted uppercase">{label}</span>
                <span className="text-sm font-mono text-text">{fmtRating(val, max)}</span>
              </div>
            ))}
            <button
              onClick={() => setEditOpen(true)}
              className="text-xs text-muted hover:text-text px-2 py-0.5 border border-surface2 rounded transition-colors self-end"
            >
              Edit
            </button>
          </div>
        </div>
      </div>

      {editOpen && (
        <EditRatingsModal
          jobId={jobId}
          job={job}
          onClose={() => setEditOpen(false)}
        />
      )}
    </>
  )
}

// ─── Evaluation card (expandable row) ─────────────────────────────────────────

type EvalWithMeta = Evaluation & { report_path: string | null; model_name: string; prompt: string | null }

function EvalRow({ evaluation }: { evaluation: EvalWithMeta }): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const [copied, setCopied] = useState(false)

  function copyPrompt(): void {
    if (!evaluation.prompt) return
    void navigator.clipboard.writeText(evaluation.prompt).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  }

  return (
    <div className="border-b border-surface2 last:border-0">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-3 py-2.5 text-left group"
      >
        <span className="text-[10px] font-mono text-muted w-24 shrink-0">{fmtDate(evaluation.evaluated_at)}</span>
        <span className="text-xs font-mono text-muted flex-1 group-hover:text-text transition-colors truncate">
          {evaluation.model_name}
        </span>
        <span className="text-xs font-mono text-text shrink-0">
          {evaluation.score_overall != null ? `${fmtScore(evaluation.score_overall)}/10` : '—'}
        </span>
        {evaluation.fit_type && (
          <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded shrink-0 ${
            evaluation.fit_type === 'Core Fit' ? 'bg-green/20 text-green' :
            evaluation.fit_type === 'Stretch'  ? 'bg-accent/20 text-accent' :
                                                  'bg-red/20 text-red'
          }`}>
            {evaluation.fit_type}
          </span>
        )}
        <span className="text-muted text-xs shrink-0">{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div className="pb-4 border-t border-surface2 pt-3 space-y-3">
          {/* Scores row */}
          <div className="flex items-center gap-4 flex-wrap">
            {([
              ['Role',    evaluation.score_role_fit,  5],
              ['Scope',   evaluation.score_scope_fit, 5],
              ['Culture', evaluation.score_culture,   5],
              ['Comp',    evaluation.score_comp,      5],
            ] as [string, number | null, number][]).map(([label, val, max]) => (
              <div key={label} className="flex flex-col items-center">
                <span className="text-[10px] font-mono text-muted uppercase">{label}</span>
                <span className="text-sm font-mono text-text">
                  {val != null ? `${fmtScore(val)}/${max}` : '—'}
                </span>
              </div>
            ))}
          </div>

          {evaluation.archetype && (
            <p className="text-xs text-muted">
              Archetype: <span className="text-text">{evaluation.archetype}</span>
            </p>
          )}
          {evaluation.recommendation && (
            <p className="text-xs">
              Rec:{' '}
              <span className={`font-mono ${
                evaluation.recommendation === 'Apply' ? 'text-green' :
                evaluation.recommendation === 'Skip'  ? 'text-red' :
                                                         'text-accent'
              }`}>
                {evaluation.recommendation}
              </span>
            </p>
          )}
          {evaluation.domain_match && (
            <p className="text-xs text-muted">
              Domain: <span className="text-text">{evaluation.domain_match}</span>
              {evaluation.role_type_match && (
                <> · Role: <span className="text-text">{evaluation.role_type_match}</span></>
              )}
            </p>
          )}
          {evaluation.strengths && (
            <div>
              <p className="text-[10px] font-mono text-muted uppercase tracking-widest mb-1">Strengths</p>
              <p className="text-xs text-text leading-relaxed">{evaluation.strengths}</p>
            </div>
          )}
          {evaluation.gaps && (
            <div>
              <p className="text-[10px] font-mono text-muted uppercase tracking-widest mb-1">Gaps</p>
              <p className="text-xs text-text leading-relaxed">{evaluation.gaps}</p>
            </div>
          )}
          {evaluation.keywords && (
            <div>
              <p className="text-[10px] font-mono text-muted uppercase tracking-widest mb-1">Keywords</p>
              <p className="text-xs font-mono text-muted leading-relaxed">{evaluation.keywords}</p>
            </div>
          )}
          {evaluation.keyword_gaps && (
            <div>
              <p className="text-[10px] font-mono text-muted uppercase tracking-widest mb-1">Keyword Gaps</p>
              <p className="text-xs font-mono text-muted leading-relaxed">{evaluation.keyword_gaps}</p>
            </div>
          )}

          {/* LLM Prompt */}
          {evaluation.prompt && (
            <div>
              <div className="flex items-center justify-between mb-1">
                <p className="text-[10px] font-mono text-muted uppercase tracking-widest">LLM Prompt</p>
                <button
                  onClick={copyPrompt}
                  className="text-xs font-mono text-muted hover:text-accent transition-colors px-2 py-0.5 border border-surface2 rounded"
                >
                  {copied ? 'Copied!' : 'Copy'}
                </button>
              </div>
              <pre className="text-[10px] font-mono text-muted/70 leading-relaxed whitespace-pre-wrap break-words bg-surface2 rounded p-2 max-h-40 overflow-y-auto">
                {evaluation.prompt}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Legacy EvalCard (kept for compatibility) ─────────────────────────────────

function EvalCard({ evaluation }: { evaluation: Evaluation & { report_path: string | null } }): React.JSX.Element {
  return (
    <div className="bg-surface2 rounded p-4 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-muted text-xs font-mono">{fmtDate(evaluation.evaluated_at)}</span>
        <div className="flex items-center gap-3">
          <span className="text-xs font-mono text-muted">
            OVR <span className="text-text">{fmtScore(evaluation.score_overall)}</span>/10
          </span>
          {evaluation.fit_type && (
            <span className={`text-xs font-mono px-2 py-0.5 rounded ${
              evaluation.fit_type === 'Core Fit'
                ? 'bg-green/20 text-green'
                : evaluation.fit_type === 'Stretch'
                ? 'bg-accent/20 text-accent'
                : 'bg-red/20 text-red'
            }`}>
              {evaluation.fit_type}
            </span>
          )}
        </div>
      </div>

      <div className="flex items-center gap-4 flex-wrap">
        {(['role_fit', 'scope_fit', 'culture', 'comp'] as const).map((key) => {
          const labels: Record<string, string> = { role_fit: 'R', scope_fit: 'SC', culture: 'CU', comp: 'CO' }
          const val = evaluation[`score_${key}` as keyof Evaluation] as number | null
          return (
            <div key={key} className="flex flex-col items-center">
              <span className="text-[10px] font-mono text-muted uppercase">{labels[key]}</span>
              <span className="text-sm font-mono text-text">{fmtScore(val)}/5</span>
            </div>
          )
        })}
      </div>

      {evaluation.archetype && (
        <p className="text-xs text-muted">
          <span className="text-muted">Archetype: </span>
          <span className="text-text">{evaluation.archetype}</span>
        </p>
      )}

      {evaluation.recommendation && (
        <p className="text-xs">
          <span className="text-muted">Rec: </span>
          <span className={`font-mono ${
            evaluation.recommendation === 'Apply'
              ? 'text-green'
              : evaluation.recommendation === 'Skip'
              ? 'text-red'
              : 'text-accent'
          }`}>
            {evaluation.recommendation}
          </span>
        </p>
      )}
    </div>
  )
}

// ─── Company info section ─────────────────────────────────────────────────────

const COMPANY_INFO_TYPES = [
  { value: 'website',     label: 'Website' },
  { value: 'careerpage',  label: 'Career Page' },
  { value: 'culturepage', label: 'Culture Page' },
  { value: 'industry',    label: 'Industry' },
  { value: 'size',        label: 'Size' },
  { value: 'notes',       label: 'Notes' },
]

interface CompanyLogRowProps {
  entry: CompanyLogEntry
}

function CompanyLogRow({ entry }: CompanyLogRowProps): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const typeLabel = COMPANY_INFO_TYPES.find((t) => t.value === entry.type_value)?.label ?? entry.type_value

  return (
    <div className="border-b border-surface2 last:border-0">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between py-1.5 text-left group"
      >
        <span className="text-xs font-mono text-muted group-hover:text-text transition-colors">{typeLabel}</span>
        <span className="text-muted text-xs">{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div className="pb-2 space-y-1">
          {entry.log && (
            <p className="text-xs text-text leading-relaxed">{entry.log}</p>
          )}
          {entry.url && (
            <a
              href={entry.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-accent hover:underline break-all block"
            >
              {entry.url}
            </a>
          )}
          {!entry.log && !entry.url && (
            <p className="text-xs text-muted italic">No content.</p>
          )}
        </div>
      )}
    </div>
  )
}

interface EditJobInfoModalProps {
  jobId: number
  initial: { location: string | null; remote_type: string | null; pay_band: string | null; role_keyword: string | null }
  onClose: () => void
}

function EditJobInfoModal({ jobId, initial, onClose }: EditJobInfoModalProps): React.JSX.Element {
  const [location, setLocation] = useState(initial.location ?? '')
  const [remoteType, setRemoteType] = useState(initial.remote_type ?? '')
  const [payBand, setPayBand] = useState(initial.pay_band ?? '')
  const [roleKeyword, setRoleKeyword] = useState(initial.role_keyword ?? '')
  const patch = usePatchJob()

  async function handleSave(): Promise<void> {
    await patch.mutateAsync({
      jobId,
      updates: {
        location: location || undefined,
        remote_type: remoteType || undefined,
        pay_band: payBand || null,
        role_keyword: roleKeyword || null,
      },
    })
    onClose()
  }

  return (
    <div className="fixed inset-0 bg-bg/80 flex items-center justify-center z-50">
      <div className="bg-surface rounded p-6 w-full max-w-md space-y-4">
        <h2 className="font-serif text-accent text-lg">Edit Job Info</h2>
        <div className="space-y-3">
          <label className="block">
            <span className="text-muted text-xs font-mono uppercase tracking-widest">Location</span>
            <input
              className="mt-1 w-full bg-surface2 rounded px-3 py-2 text-text text-sm focus:outline-none focus:ring-1 focus:ring-accent"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
            />
          </label>
          <label className="block">
            <span className="text-muted text-xs font-mono uppercase tracking-widest">Remote Type</span>
            <select
              className="mt-1 w-full bg-surface2 rounded px-3 py-2 text-text text-sm focus:outline-none focus:ring-1 focus:ring-accent"
              value={remoteType}
              onChange={(e) => setRemoteType(e.target.value)}
            >
              <option value="">—</option>
              <option>Remote</option>
              <option>Hybrid</option>
              <option>On-site</option>
            </select>
          </label>
          <label className="block">
            <span className="text-muted text-xs font-mono uppercase tracking-widest">Pay Band</span>
            <input
              className="mt-1 w-full bg-surface2 rounded px-3 py-2 text-text text-sm focus:outline-none focus:ring-1 focus:ring-accent"
              value={payBand}
              onChange={(e) => setPayBand(e.target.value)}
            />
          </label>
          <label className="block">
            <span className="text-muted text-xs font-mono uppercase tracking-widest">Role Keyword</span>
            <input
              className="mt-1 w-full bg-surface2 rounded px-3 py-2 text-text text-sm focus:outline-none focus:ring-1 focus:ring-accent"
              value={roleKeyword}
              onChange={(e) => setRoleKeyword(e.target.value)}
            />
          </label>
        </div>
        <div className="flex justify-end gap-2 pt-1">
          <button onClick={onClose} className="px-4 py-1.5 text-sm text-muted hover:text-text transition-colors">
            Cancel
          </button>
          <button
            onClick={() => void handleSave()}
            disabled={patch.isPending}
            className="px-4 py-1.5 text-sm bg-accent text-bg rounded hover:bg-accent/90 disabled:opacity-50 transition-colors"
          >
            {patch.isPending ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}

interface AddCompanyInfoModalProps {
  jobId: number
  onClose: () => void
}

function AddCompanyInfoModal({ jobId, onClose }: AddCompanyInfoModalProps): React.JSX.Element {
  const [typeValue, setTypeValue] = useState('website')
  const [log, setLog] = useState('')
  const [url, setUrl] = useState('')
  const addLog = useAddCompanyLog()

  async function handleSave(): Promise<void> {
    await addLog.mutateAsync({ jobId, type_value: typeValue, log: log || undefined, url: url || undefined })
    onClose()
  }

  return (
    <div className="fixed inset-0 bg-bg/80 flex items-center justify-center z-50">
      <div className="bg-surface rounded p-6 w-full max-w-md space-y-4">
        <h2 className="font-serif text-accent text-lg">Add Company Info</h2>
        <div className="space-y-3">
          <label className="block">
            <span className="text-muted text-xs font-mono uppercase tracking-widest">Type</span>
            <select
              className="mt-1 w-full bg-surface2 rounded px-3 py-2 text-text text-sm focus:outline-none focus:ring-1 focus:ring-accent"
              value={typeValue}
              onChange={(e) => setTypeValue(e.target.value)}
            >
              {COMPANY_INFO_TYPES.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="text-muted text-xs font-mono uppercase tracking-widest">Notes</span>
            <textarea
              className="mt-1 w-full h-24 bg-surface2 rounded px-3 py-2 text-text text-sm font-mono focus:outline-none focus:ring-1 focus:ring-accent resize-y"
              value={log}
              onChange={(e) => setLog(e.target.value)}
              placeholder="Optional notes…"
            />
          </label>
          <label className="block">
            <span className="text-muted text-xs font-mono uppercase tracking-widest">URL</span>
            <input
              type="url"
              className="mt-1 w-full bg-surface2 rounded px-3 py-2 text-text text-sm font-mono focus:outline-none focus:ring-1 focus:ring-accent"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://…"
            />
          </label>
        </div>
        {addLog.isError && <p className="text-red text-xs">{addLog.error.message}</p>}
        <div className="flex justify-end gap-2 pt-1">
          <button onClick={onClose} className="px-4 py-1.5 text-sm text-muted hover:text-text transition-colors">
            Cancel
          </button>
          <button
            onClick={() => void handleSave()}
            disabled={addLog.isPending}
            className="px-4 py-1.5 text-sm bg-accent text-bg rounded hover:bg-accent/90 disabled:opacity-50 transition-colors"
          >
            {addLog.isPending ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}

interface JobInfoSectionProps {
  jobId: number
  job: { location: string | null; remote_type: string | null; pay_band: string | null; role_keyword: string | null }
  companyLog: CompanyLogEntry[]
}

function JobInfoSection({ jobId, job, companyLog }: JobInfoSectionProps): React.JSX.Element {
  const [editOpen, setEditOpen] = useState(false)
  const [addOpen, setAddOpen] = useState(false)

  return (
    <>
      <div className="grid grid-cols-2 gap-6">
        <div>
          <div className="flex items-center justify-between mb-3">
            <p className="text-[10px] font-mono text-muted uppercase tracking-widest">Job Info</p>
            <button
              onClick={() => setEditOpen(true)}
              className="text-xs text-muted hover:text-text px-2 py-0.5 border border-surface2 rounded transition-colors"
            >
              Edit
            </button>
          </div>
          <div className="space-y-1.5">
            {([ ['Location', job.location], ['Remote', job.remote_type], ['Pay Band', job.pay_band], ['Role Keyword', job.role_keyword] ] as [string, string | null][]).map(([label, val]) => (
              <div key={label} className="flex items-baseline gap-2">
                <span className="text-[10px] font-mono text-muted uppercase w-20 shrink-0">{label}</span>
                <span className="text-xs text-text">{val ?? '—'}</span>
              </div>
            ))}
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-3">
            <p className="text-[10px] font-mono text-muted uppercase tracking-widest">Company Info</p>
            <button
              onClick={() => setAddOpen(true)}
              className="text-xs text-muted hover:text-text px-2 py-0.5 border border-surface2 rounded transition-colors"
            >
              + Add
            </button>
          </div>
          {companyLog.length === 0 ? (
            <p className="text-xs text-muted italic">No company info yet.</p>
          ) : (
            <div>
              {companyLog.map((entry) => (
                <CompanyLogRow key={entry.id} entry={entry} />
              ))}
            </div>
          )}
        </div>
      </div>

      {editOpen && (
        <EditJobInfoModal jobId={jobId} initial={job} onClose={() => setEditOpen(false)} />
      )}
      {addOpen && (
        <AddCompanyInfoModal jobId={jobId} onClose={() => setAddOpen(false)} />
      )}
    </>
  )
}

// ─── Import modal ─────────────────────────────────────────────────────────────

interface ImportModalProps {
  models: LlmModel[]
  defaultModelId: number | null
  onClose: () => void
  onImport: (modelId: number | null, parsed: Record<string, unknown>) => void
  importError: string
  importing: boolean
}

function ImportModal({
  models,
  defaultModelId,
  onClose,
  onImport,
  importError,
  importing,
}: ImportModalProps): React.JSX.Element {
  const [rawText, setRawText] = useState('')
  const [modelId, setModelId] = useState<number | null>(defaultModelId)
  const [parseError, setParseError] = useState('')

  function handleImport(): void {
    setParseError('')
    const start = rawText.indexOf('EVALUATION_JSON_START')
    const end = rawText.indexOf('EVALUATION_JSON_END')
    const jsonStr = start !== -1 && end !== -1
      ? rawText.slice(start + 'EVALUATION_JSON_START'.length, end).trim()
      : rawText.trim()
    let parsed: Record<string, unknown>
    try {
      parsed = JSON.parse(jsonStr) as Record<string, unknown>
    } catch (e) {
      setParseError(`JSON parse error: ${(e as Error).message}`)
      return
    }
    onImport(modelId, parsed)
  }

  const error = parseError || importError

  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
      <div className="bg-surface border border-surface2 rounded-xl p-7 max-w-lg w-full shadow-2xl flex flex-col gap-4">
        <div>
          <p className="font-serif text-accent text-lg mb-1">Import External Model Evaluation</p>
          <p className="text-xs text-muted leading-relaxed">
            Paste the evaluation JSON output. Sentinels{' '}
            <span className="font-mono text-accent/70">
              EVALUATION_JSON_START … EVALUATION_JSON_END
            </span>
            {' '}are optional — if present they will be stripped automatically.
          </p>
          <p className="text-xs text-muted/60 leading-relaxed mt-1">
            Models must be added in Settings before they are available here.
          </p>
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-[10px] font-mono text-muted uppercase tracking-wider">Model</label>
          <select
            value={modelId ?? ''}
            onChange={(e) =>
              setModelId(e.target.value ? parseInt(e.target.value, 10) : null)
            }
            className="bg-surface2 border border-surface2 rounded px-3 py-2 text-sm font-mono text-text focus:outline-none focus:border-accent/50"
          >
            <option value="">— default model —</option>
            {models.map((m) => (
              <option key={m.id} value={m.id}>
                {m.model}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-[10px] font-mono text-muted uppercase tracking-wider">
            Evaluation JSON
          </label>
          <textarea
            value={rawText}
            onChange={(e) => setRawText(e.target.value)}
            placeholder="Paste the full response here…"
            rows={8}
            className="bg-surface2 border border-surface2 rounded px-3 py-2 text-xs font-mono text-text focus:outline-none focus:border-accent/50 resize-y"
          />
        </div>

        {error && <p className="text-xs font-mono text-red">{error}</p>}

        <div className="flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-sans bg-surface2 text-muted border border-surface2 rounded hover:text-text transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleImport}
            disabled={importing}
            className="px-4 py-2 text-sm font-sans bg-accent text-bg rounded hover:bg-accent/90 transition-colors disabled:opacity-50"
          >
            {importing ? 'Importing…' : 'Import'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Inline company info add form (right column COMPANY INFO section) ─────────

interface CompanyInfoInlineFormProps {
  jobId: number
  onSaved: () => void
}

function CompanyInfoInlineForm({ jobId, onSaved }: CompanyInfoInlineFormProps): React.JSX.Element {
  const [typeValue, setTypeValue] = useState('website')
  const [log, setLog] = useState('')
  const [url, setUrl] = useState('')
  const addLog = useAddCompanyLog()

  async function handleSave(): Promise<void> {
    if (!log.trim() && !url.trim()) return
    await addLog.mutateAsync({ jobId, type_value: typeValue, log: log || undefined, url: url || undefined })
    setLog('')
    setUrl('')
    onSaved()
  }

  return (
    <div className="space-y-3 pb-4 border-b border-surface2 mb-4">
      <p className="text-[10px] font-mono text-muted uppercase tracking-widest">Add Company Info</p>
      <label className="block">
        <span className="text-[10px] font-mono text-muted uppercase tracking-widest block">Type</span>
        <select
          className="mt-1 w-full bg-surface2 rounded px-3 py-2 text-text text-sm focus:outline-none focus:ring-1 focus:ring-accent"
          value={typeValue}
          onChange={(e) => setTypeValue(e.target.value)}
        >
          {COMPANY_INFO_TYPES.map((t) => (
            <option key={t.value} value={t.value}>{t.label}</option>
          ))}
        </select>
      </label>
      <label className="block">
        <span className="text-[10px] font-mono text-muted uppercase tracking-widest block">Notes</span>
        <textarea
          className="mt-1 w-full h-20 bg-surface2 rounded px-3 py-2 text-text text-sm focus:outline-none focus:ring-1 focus:ring-accent resize-y"
          value={log}
          onChange={(e) => setLog(e.target.value)}
          placeholder="Optional notes…"
        />
      </label>
      <label className="block">
        <span className="text-[10px] font-mono text-muted uppercase tracking-widest block">URL</span>
        <input
          type="url"
          className="mt-1 w-full bg-surface2 rounded px-3 py-2 text-text text-sm font-mono focus:outline-none focus:ring-1 focus:ring-accent"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://…"
        />
      </label>
      {addLog.isError && <p className="text-red text-xs">{addLog.error.message}</p>}
      <button
        onClick={() => void handleSave()}
        disabled={addLog.isPending || (!log.trim() && !url.trim())}
        className="px-4 py-2 text-sm bg-accent text-bg rounded hover:bg-accent/90 disabled:opacity-50 transition-colors"
      >
        {addLog.isPending ? 'Saving…' : 'Save'}
      </button>
    </div>
  )
}

// ─── Timestamp modal ──────────────────────────────────────────────────────────

interface TimestampModalProps {
  current: string
  onSave: (ts: string) => void
  onClose: () => void
}

function TimestampModal({ current, onSave, onClose }: TimestampModalProps): React.JSX.Element {
  const [val, setVal] = useState(current.slice(0, 16))

  return (
    <div className="fixed inset-0 bg-bg/80 flex items-center justify-center z-50">
      <div className="bg-surface rounded p-6 w-full max-w-sm space-y-4">
        <h2 className="font-serif text-accent text-lg">Edit Timestamp</h2>
        <input
          type="datetime-local"
          className="w-full bg-surface2 rounded px-3 py-2 text-text text-sm focus:outline-none focus:ring-1 focus:ring-accent"
          value={val}
          onChange={(e) => setVal(e.target.value)}
        />
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-1.5 text-sm text-muted hover:text-text transition-colors">
            Cancel
          </button>
          <button
            onClick={() => onSave(val)}
            className="px-4 py-1.5 text-sm bg-accent text-bg rounded hover:bg-accent/90 transition-colors"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Activity log row ─────────────────────────────────────────────────────────

const BADGE_CLASSES: Record<string, string> = {
  evaluation:           'bg-green/15 text-green',
  llm_call:             'bg-accent/15 text-accent',
  application_log:      'bg-blue-500/15 text-blue-400',
  audit:                'bg-surface2 text-muted',
  company_log:          'bg-purple-500/15 text-purple-400',
  job_posting:          'bg-surface2 text-dim',
  application_question: 'bg-blue-500/10 text-blue-400',
}

interface ActivityLogRowProps {
  entry: ActivityLogEntry
  applicationId: number | null
  onTimestampSaved: () => void
}

function ActivityLogRow({ entry, applicationId, onTimestampSaved }: ActivityLogRowProps): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState(false)
  const [tsModalOpen, setTsModalOpen] = useState(false)
  const [copied, setCopied] = useState(false)
  const patchLogTs = usePatchLogTimestamp()
  const patchAuditTs = usePatchAuditTimestamp()

  const badgeClass = BADGE_CLASSES[entry.entry_type] ?? 'bg-surface2 text-muted'

  function copyText(): void {
    const content = entry.text ?? entry.url ?? ''
    if (!content) return
    void navigator.clipboard.writeText(content).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  }

  function handleTimestampSave(ts: string): void {
    if (!applicationId || !entry.raw_id) return
    const isoTs = ts.includes('T') ? ts + ':00' : ts
    if (entry.entry_type === 'application_log') {
      patchLogTs.mutate(
        { applicationId, logId: entry.raw_id, timestamp: isoTs },
        { onSuccess: () => { setTsModalOpen(false); onTimestampSaved() } },
      )
    } else if (entry.entry_type === 'audit') {
      patchAuditTs.mutate(
        { applicationId, auditId: entry.raw_id, timestamp: isoTs },
        { onSuccess: () => { setTsModalOpen(false); onTimestampSaved() } },
      )
    }
  }

  return (
    <div className="border-b border-surface2 last:border-0">
      <div className="flex items-center gap-2 py-2 min-w-0">
        {/* Timestamp */}
        <button
          className={`text-[10px] font-mono w-32 shrink-0 text-left ${
            entry.can_edit_timestamp ? 'text-muted hover:text-accent cursor-pointer' : 'text-muted cursor-default'
          }`}
          onClick={() => entry.can_edit_timestamp && setTsModalOpen(true)}
          disabled={!entry.can_edit_timestamp}
        >
          {fmtDateTime(entry.timestamp)}
        </button>

        {/* Badge */}
        <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded shrink-0 ${badgeClass}`}>
          {entry.entry_type.replace('_', ' ')}
        </span>

        {/* Activity type */}
        <span className="text-[10px] font-mono text-muted uppercase tracking-wider w-28 shrink-0 truncate">
          {entry.activity_type}
        </span>

        {/* Source */}
        <span className="text-[10px] font-mono text-muted flex-1 truncate min-w-0">
          {entry.source}
        </span>

        {/* Actions */}
        <div className="flex items-center gap-1 shrink-0">
          {(entry.text ?? entry.url) && (
            <button
              onClick={copyText}
              className="text-[10px] font-mono text-muted hover:text-accent transition-colors px-1.5 py-0.5 border border-surface2 rounded"
            >
              {copied ? '✓' : 'Copy'}
            </button>
          )}
          {entry.can_delete && (
            <button
              onClick={() => {
                if (deleteConfirm) {
                  // actual delete is wired in P11 when delete mutations are available
                  setDeleteConfirm(false)
                } else {
                  setDeleteConfirm(true)
                  setTimeout(() => setDeleteConfirm(false), 3000)
                }
              }}
              className={`text-[10px] font-mono px-1.5 py-0.5 border rounded transition-colors ${
                deleteConfirm
                  ? 'border-red text-red'
                  : 'border-surface2 text-muted hover:text-red hover:border-red'
              }`}
            >
              {deleteConfirm ? 'Confirm' : 'Delete'}
            </button>
          )}
          <button
            onClick={() => setOpen((o) => !o)}
            className="text-[10px] text-muted hover:text-text transition-colors px-1"
          >
            {open ? '▲' : '▼'}
          </button>
        </div>
      </div>

      {/* Expanded content */}
      {open && (
        <div className="pb-3 border-t border-surface2 pt-2 pl-2">
          {entry.text ? (
            <pre className="text-xs text-text leading-relaxed whitespace-pre-wrap font-mono break-words">
              {entry.text}
            </pre>
          ) : null}
          {entry.url ? (
            <a
              href={entry.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-accent hover:underline break-all block mt-1"
            >
              {entry.url}
            </a>
          ) : null}
          {!entry.text && !entry.url && (
            <p className="text-xs text-muted italic">No content.</p>
          )}
        </div>
      )}

      {tsModalOpen && (
        <TimestampModal
          current={entry.timestamp}
          onSave={handleTimestampSave}
          onClose={() => setTsModalOpen(false)}
        />
      )}
    </div>
  )
}

// ─── JOB DETAILS tab — left column ───────────────────────────────────────────

type JobDetailsAction = 'evaluations' | 'job-description' | 'company-info'

interface JobDetailsLeftProps {
  jobId: number
  job: Job
  active: JobDetailsAction
  onSelect: (a: JobDetailsAction) => void
}

function JobDetailsLeft({ jobId, job, active, onSelect }: JobDetailsLeftProps): React.JSX.Element {
  const [ratingsOpen, setRatingsOpen] = useState(false)
  const [jobInfoOpen, setJobInfoOpen] = useState(false)

  const actions: { id: JobDetailsAction; label: string }[] = [
    { id: 'evaluations',     label: 'Evaluations' },
    { id: 'job-description', label: 'Job Description' },
    { id: 'company-info',    label: 'Company Info' },
  ]

  function fmtRating(val: number | null, max: number): string {
    if (val === null || val === undefined) return '—'
    return `${val.toFixed(1)} /${max}`
  }

  const excitementNum = job.excitement_level !== null
    ? (isNaN(parseInt(job.excitement_level, 10)) ? null : parseInt(job.excitement_level, 10))
    : null

  return (
    <>
      {/* ACTIONS */}
      <div className="space-y-0.5 mb-4">
        <p className="text-[10px] font-mono text-muted uppercase tracking-widest mb-2">Actions</p>
        {actions.map(({ id, label }) => (
          <button
            key={id}
            onClick={() => onSelect(id)}
            className={`w-full text-left px-3 py-2 text-sm font-mono rounded-r transition-colors ${
              active === id
                ? 'bg-surface2 text-accent border-l-2 border-accent'
                : 'text-muted hover:text-text'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <hr className="border-surface2 my-4" />

      {/* SUMMARY */}
      <div className="space-y-5">
        <p className="font-serif text-lg text-text">{job.company_name}</p>

        {/* Excitement */}
        <div>
          <p className="text-[10px] font-mono text-muted uppercase tracking-widest mb-1.5">Excitement</p>
          <div className="flex items-center gap-0.5">
            {[1, 2, 3, 4, 5].map((i) => (
              <span
                key={i}
                className={`text-lg leading-none ${i <= (excitementNum ?? 0) ? 'text-accent' : 'text-muted/30'}`}
              >
                ★
              </span>
            ))}
          </div>
        </div>

        {/* My Ratings */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <p className="text-[10px] font-mono text-muted uppercase tracking-widest">My Ratings</p>
            <button
              onClick={() => setRatingsOpen(true)}
              className="text-xs text-muted hover:text-text px-2 py-0.5 border border-surface2 rounded transition-colors"
            >
              Edit
            </button>
          </div>
          <div className="space-y-1">
            {([
              ['Role',    job.my_role_fit,      5],
              ['Scope',   job.my_scope_fit,     5],
              ['Culture', job.my_culture,       5],
              ['Comp',    job.my_comp,          5],
              ['Overall', job.my_score_overall, 10],
            ] as [string, number | null, number][]).map(([label, val, max]) => (
              <div key={label} className="flex items-baseline gap-2">
                <span className="text-[10px] font-mono text-muted w-14 shrink-0">{label}</span>
                <span className="text-xs font-mono text-text">{fmtRating(val, max)}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Job Info */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <p className="text-[10px] font-mono text-muted uppercase tracking-widest">Job Info</p>
            <button
              onClick={() => setJobInfoOpen(true)}
              className="text-xs text-muted hover:text-text px-2 py-0.5 border border-surface2 rounded transition-colors"
            >
              Edit
            </button>
          </div>
          <div className="space-y-1">
            {([
              ['Location', job.location],
              ['Remote',   job.remote_type],
              ['Pay Band', job.pay_band],
              ['Keyword',  job.role_keyword],
            ] as [string, string | null][]).map(([label, val]) => (
              <div key={label} className="flex items-baseline gap-2">
                <span className="text-[10px] font-mono text-muted w-14 shrink-0">{label}</span>
                <span className="text-xs text-text">{val ?? '—'}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {ratingsOpen && (
        <EditRatingsModal jobId={jobId} job={job} onClose={() => setRatingsOpen(false)} />
      )}
      {jobInfoOpen && (
        <EditJobInfoModal jobId={jobId} initial={job} onClose={() => setJobInfoOpen(false)} />
      )}
    </>
  )
}

// ─── JOB DETAILS tab — right column ──────────────────────────────────────────

interface JobDetailsRightProps {
  jobId: number
  job: Job
  evaluations: EvalWithMeta[]
  companyLog: CompanyLogEntry[]
  activeAction: JobDetailsAction
  onOpenImport: () => void
}

function JobDetailsRight({
  jobId,
  job,
  evaluations,
  companyLog,
  activeAction,
  onOpenImport,
}: JobDetailsRightProps): React.JSX.Element {
  const [editDescOpen, setEditDescOpen] = useState(false)
  const [descCopied, setDescCopied] = useState(false)
  const [exportCopied, setExportCopied] = useState(false)
  const [savedInfo, setSavedInfo] = useState(false)

  function copyDescription(): void {
    if (!job.description_merged) return
    void navigator.clipboard.writeText(job.description_merged).then(() => {
      setDescCopied(true)
      setTimeout(() => setDescCopied(false), 1500)
    })
  }

  function exportJob(): void {
    const lines = [
      `Company: ${job.company_name}`,
      `Title: ${job.title}`,
      `Location: ${job.location ?? '—'}`,
      `Remote: ${job.remote_type ?? '—'}`,
      `Pay Band: ${job.pay_band ?? '—'}`,
      '',
      job.description_merged ?? '',
    ]
    void navigator.clipboard.writeText(lines.join('\n')).then(() => {
      setExportCopied(true)
      setTimeout(() => setExportCopied(false), 1500)
    })
  }

  // ── EVALUATIONS view ────────────────────────────────────────────────────────
  if (activeAction === 'evaluations') {
    return (
      <>
        {/* Agg score row */}
        <div className="flex items-center gap-6 mb-6 pb-4 border-b border-surface2">
          <div className="flex items-center gap-4 flex-1 flex-wrap">
            {([
              ['Overall', job.agg_score_overall, 10],
              ['Role',    job.agg_role_fit,      5],
              ['Scope',   job.agg_scope_fit,     5],
              ['Culture', job.agg_culture,       5],
              ['Comp',    job.agg_comp,          5],
            ] as [string, number | null, number][]).map(([label, val, max]) => (
              <div key={label} className="flex flex-col items-center">
                <span className="text-[10px] font-mono text-muted uppercase tracking-widest">{label}</span>
                <span className="font-serif text-xl text-accent leading-none mt-1">
                  {val != null ? fmtScore(val) : '—'}
                </span>
                <span className="text-[10px] font-mono text-muted">/{max}</span>
              </div>
            ))}
          </div>
          <button
            onClick={onOpenImport}
            className="px-3 py-1.5 text-xs font-mono text-muted border border-surface2 rounded hover:text-text hover:border-accent/40 transition-colors shrink-0"
          >
            Import External Eval
          </button>
        </div>

        {/* Evaluation rows */}
        {evaluations.length === 0 ? (
          <p className="text-sm text-muted italic">
            No evaluations yet. Run one from the Evaluate page.
          </p>
        ) : (
          <div>
            {evaluations.map((ev) => (
              <EvalRow key={ev.id} evaluation={ev} />
            ))}
          </div>
        )}

        {editDescOpen && (
          <EditDescriptionModal
            jobId={jobId}
            initial={job.description_merged ?? ''}
            onClose={() => setEditDescOpen(false)}
          />
        )}
      </>
    )
  }

  // ── JOB DESCRIPTION view ────────────────────────────────────────────────────
  if (activeAction === 'job-description') {
    return (
      <>
        <div className="flex items-center gap-2 mb-4">
          <button
            onClick={() => setEditDescOpen(true)}
            className="px-3 py-1.5 text-xs font-mono text-muted border border-surface2 rounded hover:text-text hover:border-accent/40 transition-colors"
          >
            Edit
          </button>
          <button
            onClick={copyDescription}
            className="px-3 py-1.5 text-xs font-mono text-muted border border-surface2 rounded hover:text-text hover:border-accent/40 transition-colors"
          >
            {descCopied ? 'Copied!' : 'Copy JD'}
          </button>
          <button
            onClick={exportJob}
            className="px-3 py-1.5 text-xs font-mono text-muted border border-surface2 rounded hover:text-text hover:border-accent/40 transition-colors"
          >
            {exportCopied ? 'Copied!' : 'Export Job'}
          </button>
        </div>

        {job.description_merged ? (
          <pre className="text-xs text-text font-sans leading-relaxed whitespace-pre-wrap break-words">
            {job.description_merged}
          </pre>
        ) : (
          <p className="text-sm text-muted italic">No description yet.</p>
        )}

        {editDescOpen && (
          <EditDescriptionModal
            jobId={jobId}
            initial={job.description_merged ?? ''}
            onClose={() => setEditDescOpen(false)}
          />
        )}
      </>
    )
  }

  // ── COMPANY INFO view ────────────────────────────────────────────────────────
  return (
    <>
      <CompanyInfoInlineForm jobId={jobId} onSaved={() => setSavedInfo(!savedInfo)} />

      {companyLog.length === 0 ? (
        <p className="text-sm text-muted italic">No company info yet.</p>
      ) : (
        <div>
          {companyLog.map((entry) => (
            <CompanyLogRow key={entry.id} entry={entry} />
          ))}
        </div>
      )}
    </>
  )
}

// ─── Workspace page ───────────────────────────────────────────────────────────

export default function JobDetailPage(): React.JSX.Element {
  const { jobId: jobIdParam } = useParams<{ jobId: string }>()
  const jobId = parseInt(jobIdParam ?? '0', 10)
  const [searchParams, setSearchParams] = useSearchParams()
  const activeTab = (searchParams.get('tab') ?? 'job-details') as TabId

  const { data: jobData, isLoading: jobLoading, isError: jobError } = useJobDetail(jobId)
  const applicationId = jobData?.job.application_id ?? undefined
  const { data: appData, isLoading: appLoading } = useApplicationDetail(applicationId)
  const { data: activityData, isLoading: activityLoading, isError: activityError } =
    useActivityLog(activeTab === 'application-log' ? jobId : undefined)

  // JOB DETAILS tab action state
  const [jobDetailsAction, setJobDetailsAction] = useState<JobDetailsAction>('evaluations')

  // Import modal state
  const [importOpen, setImportOpen] = useState(false)
  const [importError, setImportError] = useState('')
  const importMutation = useImportEvaluationMutation()
  const { data: models = [] } = useModels()
  const qc = useQueryClient()

  function setTab(tab: TabId): void {
    setSearchParams({ tab }, { replace: true })
  }

  if (jobLoading) {
    return (
      <div className="flex flex-col h-screen">
        <AppHeader pageName="Jobs" />
        <div className="p-6 text-muted text-sm">Loading…</div>
      </div>
    )
  }

  if (jobError || !jobData) {
    return (
      <div className="flex flex-col h-screen">
        <AppHeader pageName="Jobs" />
        <div className="p-6 text-red text-sm">Job not found.</div>
      </div>
    )
  }

  const { job } = jobData
  const evaluations = jobData.evaluations as EvalWithMeta[]
  const appStatus = appData?.application.application_status ?? null
  const defaultModelId = models.find((m) => m.default_flag === 1)?.id ?? null

  async function handleImport(
    modelId: number | null,
    parsed: Record<string, unknown>,
  ): Promise<void> {
    setImportError('')
    const payload: ImportPayload = {
      job_id: job.id,
      llm_model_id: modelId,
      score_overall:   (parsed.score_overall   as number | null) ?? null,
      score_role_fit:  (parsed.score_role_fit  as number | null) ?? null,
      score_scope_fit: (parsed.score_scope_fit as number | null) ?? null,
      score_culture:   (parsed.score_culture   as number | null) ?? null,
      score_comp:      (parsed.score_comp      as number | null) ?? null,
      fit_type:        (parsed.fit_type        as string | null) ?? null,
      archetype:       (parsed.archetype       as string | null) ?? null,
      strengths:       (parsed.strengths       as string | null) ?? null,
      gaps:            (parsed.gaps            as string | null) ?? null,
      recommendation:  (parsed.recommendation  as string | null) ?? null,
      keywords:        (parsed.keywords        as string | null) ?? null,
      domain_match:    (parsed.domain_match    as string | null) ?? null,
      role_type_match: (parsed.role_type_match as string | null) ?? null,
      keyword_gaps:    (parsed.keyword_gaps    as string | null) ?? null,
    }
    try {
      await importMutation.mutateAsync(payload)
      setImportOpen(false)
      void qc.invalidateQueries({ queryKey: ['job', jobId] })
    } catch (err) {
      setImportError((err as Error).message)
    }
  }

  return (
    <div className="flex flex-col h-screen overflow-hidden">
      <AppHeader pageName={job.title} />

      <WorkspaceSubHeader job={job} appStatus={appStatus} appLoading={appLoading} />

      {/* Tab bar */}
      <div className="flex border-b border-surface2 px-6 shrink-0">
        {TABS.map(({ id, label }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`px-4 py-3 text-xs font-mono uppercase tracking-widest transition-colors border-b-2 -mb-px ${
              activeTab === id
                ? 'border-accent text-accent'
                : 'border-transparent text-muted hover:text-text'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* ── APPLICATION LOG tab — full width ── */}
      {activeTab === 'application-log' ? (
        <div className="flex-1 overflow-y-auto p-6">
          <p className="font-serif text-accent text-xl mb-1">Application Log</p>
          {activityData && (
            <p className="text-xs font-mono text-muted mb-6">
              {activityData.entries.length} {activityData.entries.length === 1 ? 'entry' : 'entries'}
            </p>
          )}

          {activityLoading && (
            <p className="text-sm text-muted">Loading log…</p>
          )}
          {activityError && (
            <p className="text-sm text-red">Failed to load log.</p>
          )}
          {activityData && activityData.entries.length === 0 && (
            <p className="text-sm text-muted italic">No activity yet.</p>
          )}
          {activityData && activityData.entries.length > 0 && (
            <div>
              {activityData.entries.map((entry, idx) => (
                <ActivityLogRow
                  key={`${entry.entry_type}-${entry.raw_id ?? idx}`}
                  entry={entry}
                  applicationId={applicationId ?? null}
                  onTimestampSaved={() => void qc.invalidateQueries({ queryKey: ['activity-log', jobId] })}
                />
              ))}
            </div>
          )}
        </div>
      ) : (
        /* ── 2-column tabs ── */
        <div className="flex flex-1 overflow-hidden">
          {/* Left column */}
          <div className="w-[280px] shrink-0 border-r border-surface2 overflow-y-auto p-4">
            {activeTab === 'job-details' && (
              <JobDetailsLeft
                jobId={jobId}
                job={job}
                active={jobDetailsAction}
                onSelect={setJobDetailsAction}
              />
            )}
            {(activeTab === 'resume-cover' || activeTab === 'interview') && (
              <p className="text-[10px] font-mono text-muted uppercase tracking-widest">
                Nothing to configure yet.
              </p>
            )}
            {/* APPLICATION left column — built in P11 */}
          </div>

          {/* Right column */}
          <div className="flex-1 overflow-y-auto p-6">
            {activeTab === 'job-details' && (
              <JobDetailsRight
                jobId={jobId}
                job={job}
                evaluations={evaluations}
                companyLog={jobData.company_log}
                activeAction={jobDetailsAction}
                onOpenImport={() => setImportOpen(true)}
              />
            )}
            {activeTab === 'resume-cover' && (
              <div className="bg-surface border border-surface2 rounded-xl p-6 max-w-lg">
                <p className="font-serif text-accent text-lg mb-2">Resume & Cover Letter</p>
                <p className="text-sm text-muted leading-relaxed">
                  Upload and manage your resume and cover letter documents.
                  Connect to Typst for PDF compilation and tailored resume generation.
                </p>
                <p className="mt-4 text-xs font-mono text-muted/60">Coming in Phase 1.6.</p>
              </div>
            )}
            {activeTab === 'interview' && (
              <div className="bg-surface border border-surface2 rounded-xl p-6 max-w-lg">
                <p className="font-serif text-accent text-lg mb-2">Interview Tracking</p>
                <p className="text-sm text-muted leading-relaxed">
                  Track interview stages, scheduling, prep notes, and feedback from each round.
                </p>
                <p className="mt-4 text-xs font-mono text-muted/60">Coming soon.</p>
              </div>
            )}
            {/* APPLICATION right column — built in P11 */}
          </div>
        </div>
      )}

      {/* Import modal */}
      {importOpen && (
        <ImportModal
          models={models}
          defaultModelId={defaultModelId}
          onClose={() => setImportOpen(false)}
          onImport={(modelId, parsed) => void handleImport(modelId, parsed)}
          importError={importError}
          importing={importMutation.isPending}
        />
      )}
    </div>
  )
}

// Exported for reuse in P11 tab content
export {
  Collapsible,
  EditJobModal,
  EditDescriptionModal,
  EditRatingsModal,
  EditJobInfoModal,
  AddCompanyInfoModal,
  ImportModal,
  JobInfoSection,
  MyRatingsSection,
  EvalCard,
  CompanyLogRow,
  StarRating,
  TimestampModal,
  COMPANY_INFO_TYPES,
  fmtDate,
  fmtDateTime,
}
