import { useState, useRef, useLayoutEffect, useEffect } from 'react'
import { useParams, useSearchParams, Link } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import AppHeader from '@/components/AppHeader'
import { useJobDetail, usePatchJob, useAddCompanyLog, useUpdateCompanySummary, useActivityLog, useGenerateOrgSummaryPrompt } from '@/hooks/useJobs'
import {
  useApplicationDetail,
  usePatchApplication,
  useAddLog,
  useDeleteLog,
  usePatchLogTimestamp,
  usePatchAuditTimestamp,
} from '@/hooks/useApplications'
import {
  useApplicationQuestions,
  useCreateApplicationQuestion,
  useUpdateApplicationQuestion,
  useDeleteApplicationQuestion,
} from '@/hooks/useApplicationQuestions'
import { useLessonChat } from '@/hooks/useLessonChat'
import { useLlmCallLog } from '@/hooks/useLLMUsage'
import { LlmExpandedRow } from '@/components/LlmCallExpandedView'
import { useImportEvaluationMutation, useModels, type ImportPayload } from '@/hooks/useEvaluate'
import EvaluationFeedbackButton from '@/components/EvaluationFeedbackButton'
import { ResumeSubpage } from '@/components/ResumeSubpage'
import { CoverLetterSubpage } from '@/components/CoverLetterSubpage'
import { ApplyWorkflow } from '@/components/ApplyWorkflow'
import { StatusBadge } from '@/utils/status'
import { fmtScore } from '@/utils/formatting'
import type { LessonChatFinalizeResponse } from '@/types/profile'
import type {
  EvalWithMeta,
  LlmModel,
  LlmCallLogEntry,
  CompanyLogEntry,
  ApplicationStatus,
  Job,
  Application,
  ApplicationLog,
  JobPosting,
  ApplicationQuestion,
  ActivityLogEntry,
  ActivityLogEvalData,
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

type TabId = 'job-details' | 'apply' | 'interview' | 'application-log'

const TABS: { id: TabId; label: string }[] = [
  { id: 'job-details',     label: 'Job Details' },
  { id: 'apply',           label: 'Apply' },
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

        {/* Status */}
        <div className="flex flex-col gap-1 shrink-0">
          <span className="text-[10px] font-mono text-muted uppercase tracking-widest">Status</span>
          <div className="flex items-center gap-2">
            {appLoading ? (
              <span className="text-xs text-muted">—</span>
            ) : (
              <StatusBadge status={appStatus} />
            )}
          </div>
        </div>

        {/* Company → Title → location/remote */}
        <div className="flex flex-col gap-0.5 flex-1 min-w-0">
          <span className="text-xs text-muted font-mono">{job.company_name}</span>
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
        className="w-full flex items-center justify-between py-2 text-left group cursor-pointer"
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
      <div className="bg-surface rounded p-6 w-full max-w-4xl space-y-4">
        <h2 className="font-serif text-accent text-lg">Edit Description</h2>
        <textarea
          className="w-full h-[32rem] bg-surface2 rounded px-3 py-2 text-text text-sm font-mono focus:outline-none focus:ring-1 focus:ring-accent resize-y"
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

// ─── Edit Summary modal ───────────────────────────────────────────────────────

interface EditSummaryModalProps {
  jobId: number
  initial: string
  onClose: () => void
}

function EditSummaryModal({ jobId, initial, onClose }: EditSummaryModalProps): React.JSX.Element {
  const [text, setText] = useState(initial)
  const updateSummary = useUpdateCompanySummary()

  async function handleSave(): Promise<void> {
    await updateSummary.mutateAsync({ jobId, text })
    onClose()
  }

  return (
    <div className="fixed inset-0 bg-bg/80 flex items-center justify-center z-50">
      <div className="bg-surface rounded p-6 w-full max-w-4xl space-y-4">
        <h2 className="font-serif text-accent text-lg">Edit Company Summary</h2>
        <textarea
          className="w-full h-[32rem] bg-surface2 rounded px-3 py-2 text-text text-sm font-mono focus:outline-none focus:ring-1 focus:ring-accent resize-y"
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
            disabled={updateSummary.isPending}
            className="px-4 py-1.5 text-sm bg-accent text-bg rounded hover:bg-accent/90 disabled:opacity-50 transition-colors"
          >
            {updateSummary.isPending ? 'Saving…' : 'Save'}
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

function EvalRow({ evaluation }: { evaluation: EvalWithMeta }): React.JSX.Element {
  const [open, setOpen] = useState(false)

  return (
    <div className="bg-surface2 rounded mb-0.5 last:mb-0 hover:bg-[#2a2a2a] transition-colors">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-3 px-3 py-2.5 text-left group"
      >
        <span className="text-[10px] font-mono text-muted w-24 shrink-0">{fmtDate(evaluation.evaluated_at)}</span>
        <span className="text-xs font-mono text-muted flex-1 group-hover:text-text transition-colors truncate">
          {evaluation.eval_source} · {evaluation.model_name}
          {evaluation.prompt_version != null && ` · v${evaluation.prompt_version}`}
          {evaluation.eval_source === 'local' && evaluation.temperature != null && ` · ${evaluation.temperature}`}
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
        <div className="px-3 pb-4 border-t border-surface pt-3 space-y-3">
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

        </div>
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
  { value: 'person',      label: 'Person / LinkedIn Profile' },
]

const URL_TYPE_VALUES = new Set(['website', 'careerpage', 'culturepage', 'person'])

interface CompanyLogRowProps {
  entry: CompanyLogEntry
  collapseSignal?: number
}

function CompanyLogRow({ entry, collapseSignal = 0 }: CompanyLogRowProps): React.JSX.Element {
  const [open, setOpen] = useState(true)
  const typeLabel = COMPANY_INFO_TYPES.find((t) => t.value === entry.type_value)?.label ?? entry.type_value
  const showUrlInHeader = URL_TYPE_VALUES.has(entry.type_value) && !!entry.url

  useEffect(() => {
    if (collapseSignal > 0) setOpen(false)
  }, [collapseSignal])

  return (
    <div className="bg-surface2 rounded mb-0.5 last:mb-0 hover:bg-[#2a2a2a] transition-colors">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-2 px-2 py-1.5 text-left group"
      >
        <span className="text-xs font-mono text-muted group-hover:text-text transition-colors shrink-0">{typeLabel}</span>
        {!open && showUrlInHeader && (
          <a
            href={entry.url!}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="text-xs text-accent hover:underline truncate flex-1"
          >
            {entry.url}
          </a>
        )}
        {!open && entry.log && (
          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-surface2 text-muted shrink-0">notes</span>
        )}
        <span className="text-muted text-xs ml-auto">{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div className="px-2 pb-2 space-y-1">
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
  initial: { company_name: string; title: string; location: string | null; remote_type: string | null; pay_band: string | null; role_keyword: string | null }
  onClose: () => void
}

function EditJobInfoModal({ jobId, initial, onClose }: EditJobInfoModalProps): React.JSX.Element {
  const [companyName, setCompanyName] = useState(initial.company_name)
  const [title, setTitle] = useState(initial.title)
  const [location, setLocation] = useState(initial.location ?? '')
  const [remoteType, setRemoteType] = useState(initial.remote_type ?? '')
  const [payBand, setPayBand] = useState(initial.pay_band ?? '')
  const [roleKeyword, setRoleKeyword] = useState(initial.role_keyword ?? '')
  const patch = usePatchJob()

  const canSave = companyName.trim().length > 0 && title.trim().length > 0

  async function handleSave(): Promise<void> {
    if (!canSave) return
    await patch.mutateAsync({
      jobId,
      updates: {
        company_name: companyName.trim(),
        title: title.trim(),
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
            <span className="text-muted text-xs font-mono uppercase tracking-widest">Company Name</span>
            <input
              className="mt-1 w-full bg-surface2 rounded px-3 py-2 text-text text-sm focus:outline-none focus:ring-1 focus:ring-accent"
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
            />
          </label>
          <label className="block">
            <span className="text-muted text-xs font-mono uppercase tracking-widest">Job Title</span>
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
            disabled={patch.isPending || !canSave}
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
  job: { company_name: string; title: string; location: string | null; remote_type: string | null; pay_band: string | null; role_keyword: string | null }
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
    <div className="pb-4 border-b border-surface2 mb-4 space-y-2">
      <p className="text-[10px] font-mono text-muted uppercase tracking-widest">Add Company Info</p>
      <div className="grid grid-cols-[3fr_7fr] gap-2">
        <label className="block">
          <span className="text-[10px] font-mono text-muted uppercase tracking-widest block mb-1">Type</span>
          <select
            className="w-full bg-surface2 rounded px-2 py-1.5 text-text text-sm focus:outline-none focus:ring-1 focus:ring-accent"
            value={typeValue}
            onChange={(e) => setTypeValue(e.target.value)}
          >
            {COMPANY_INFO_TYPES.map((t) => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="text-[10px] font-mono text-muted uppercase tracking-widest block mb-1">URL</span>
          <input
            type="url"
            className="w-full bg-surface2 rounded px-2 py-1.5 text-text text-sm font-mono focus:outline-none focus:ring-1 focus:ring-accent"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://…"
          />
        </label>
      </div>
      <div className="flex gap-2 items-end">
        <label className="block flex-1">
          <span className="text-[10px] font-mono text-muted uppercase tracking-widest block mb-1">Notes</span>
          <textarea
            rows={3}
            className="w-full bg-surface2 rounded px-2 py-1.5 text-text text-sm focus:outline-none focus:ring-1 focus:ring-accent resize-none"
            value={log}
            onChange={(e) => setLog(e.target.value)}
            placeholder="Optional notes…"
          />
        </label>
        <div className="shrink-0 w-24 pb-0.5">
          {addLog.isError && <p className="text-red text-xs mb-1">{addLog.error.message}</p>}
          <button
            onClick={() => void handleSave()}
            disabled={addLog.isPending || (!log.trim() && !url.trim())}
            className="w-full px-3 py-1.5 text-sm bg-accent text-bg rounded hover:bg-accent/90 disabled:opacity-50 transition-colors"
          >
            {addLog.isPending ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
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

// ─── Prompt modal (APPLICATION tab — generate external eval + tailored resume) ─

function PromptModal({ prompt, onClose, title = 'External Eval + Tailored Resume Prompt' }: { prompt: string; onClose: () => void; title?: string }): React.JSX.Element {
  const [copied, setCopied] = useState(false)

  function handleCopy(): void {
    void navigator.clipboard.writeText(prompt).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  return (
    <div className="fixed inset-0 bg-bg/80 flex items-center justify-center z-50 p-4">
      <div className="bg-surface rounded p-6 w-full max-w-2xl flex flex-col gap-4 max-h-[80vh]">
        <div className="flex items-center justify-between">
          <h2 className="font-serif text-accent text-lg">{title}</h2>
          <div className="flex items-center gap-2">
            <button
              onClick={handleCopy}
              className="text-xs px-3 py-1.5 bg-accent text-bg rounded hover:bg-accent/90 transition-colors font-mono"
            >
              {copied ? 'Copied!' : 'Copy'}
            </button>
            <button
              onClick={onClose}
              className="text-xs px-3 py-1.5 text-muted hover:text-text transition-colors"
            >
              Close
            </button>
          </div>
        </div>
        <pre className="flex-1 overflow-y-auto text-xs font-mono text-text bg-surface2 rounded p-4 whitespace-pre-wrap break-words leading-relaxed">
          {prompt}
        </pre>
      </div>
    </div>
  )
}

// ─── Lesson capture panel (APPLICATION tab → ADD LESSON) ──────────────────────

const LESSON_OPENER =
  'Tell me about your experience with this role so far. What happened, and what are you taking away from it?'

interface LessonCapturePanelProps {
  applicationId: number
  jobTitle?: string
  companyName?: string
  onFinalized: () => void
}

function LessonCapturePanel({
  applicationId,
  jobTitle,
  companyName,
  onFinalized,
}: LessonCapturePanelProps): React.JSX.Element {
  const { messages, streamingContent, isStreaming, error, sendMessage, finalize, clearConversation } =
    useLessonChat({ applicationId })
  const [input, setInput] = useState('')
  const [finalizing, setFinalizing] = useState(false)
  const [finalizedResult, setFinalizedResult] = useState<LessonChatFinalizeResponse | null>(null)
  const [insightsChecked, setInsightsChecked] = useState(true)
  const [finalizeError, setFinalizeError] = useState('')
  const [successBanner, setSuccessBanner] = useState<{ withInsights: boolean } | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)

  const msgCount = messages.length + (streamingContent ? 1 : 0)
  useLayoutEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [msgCount, streamingContent])

  function handleSend(): void {
    const text = input.trim()
    if (!text || isStreaming) return
    setInput('')
    sendMessage(text)
  }

  async function handleFinalize(): Promise<void> {
    setFinalizing(true)
    setFinalizeError('')
    try {
      const result = await finalize()
      setFinalizedResult(result)
      onFinalized()
    } catch (e) {
      setFinalizeError(e instanceof Error ? e.message : 'Finalize failed')
    } finally {
      setFinalizing(false)
    }
  }

  function handleDone(): void {
    const withInsights = insightsChecked
    setFinalizedResult(null)
    setInsightsChecked(true)
    clearConversation()
    setSuccessBanner({ withInsights })
  }

  const contextLabel = [companyName, jobTitle].filter(Boolean).join(' — ')

  return (
    <div className="flex flex-col gap-3">
      {contextLabel && (
        <p className="text-[10px] font-mono text-muted uppercase tracking-widest">{contextLabel}</p>
      )}

      {successBanner && (
        <div className="bg-green/10 border border-green/20 rounded p-3 flex items-start justify-between gap-2">
          <div className="space-y-0.5">
            <p className="text-xs font-mono text-green">Lesson added to application log.</p>
            {successBanner.withInsights && (
              <Link to="/profile" className="text-xs text-accent hover:underline block">
                Review in Profile Insights →
              </Link>
            )}
          </div>
          <button
            onClick={() => setSuccessBanner(null)}
            className="text-muted hover:text-text text-xs shrink-0"
          >
            ✕
          </button>
        </div>
      )}

      <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
        <div className="flex justify-start">
          <div className="max-w-[90%] bg-surface2 rounded px-3 py-2 text-sm text-muted leading-relaxed whitespace-pre-wrap">
            {LESSON_OPENER}
          </div>
        </div>
        {messages.map((msg, i) => {
          const isUser = msg.role === 'user'
          return (
            <div key={i} className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
              <div
                className={`max-w-[90%] rounded px-3 py-2 text-sm leading-relaxed whitespace-pre-wrap ${
                  isUser ? 'bg-accent/20 text-text' : 'bg-surface2 text-muted'
                }`}
              >
                {msg.content}
              </div>
            </div>
          )
        })}
        {streamingContent && (
          <div className="flex justify-start">
            <div className="max-w-[90%] bg-surface2 rounded px-3 py-2 text-sm text-muted whitespace-pre-wrap leading-relaxed">
              {streamingContent}
              <span className="inline-block w-1.5 h-3.5 bg-accent/60 ml-0.5 animate-pulse align-text-bottom" />
            </div>
          </div>
        )}
        {error && <p className="text-xs font-mono text-red">{error}</p>}
        <div ref={bottomRef} />
      </div>

      {finalizedResult && (
        <div className="border border-accent/30 rounded p-4 space-y-3 bg-accent/5">
          <p className="text-[10px] font-mono text-accent uppercase tracking-wider">Lesson captured</p>
          <p className="text-xs font-mono text-muted leading-relaxed line-clamp-4">
            {finalizedResult.log_entry}
          </p>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={insightsChecked}
              onChange={(e) => setInsightsChecked(e.target.checked)}
              className="accent-[#c8a96e]"
            />
            <span className="text-xs font-sans text-text">Add to Profile Insights &amp; Lessons</span>
          </label>
          <button
            onClick={handleDone}
            className="px-3 py-1.5 text-xs font-sans bg-accent text-bg rounded hover:bg-accent/90 transition-colors"
          >
            Done
          </button>
        </div>
      )}

      {!finalizedResult && (
        <div className="space-y-2">
          <div className="flex gap-2 items-end">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  handleSend()
                }
              }}
              placeholder="Message… (Enter to send, Shift+Enter for newline)"
              rows={2}
              disabled={isStreaming}
              className="flex-1 bg-surface border border-surface2 rounded px-3 py-2 text-sm font-sans text-text placeholder-muted/50 focus:outline-none focus:border-accent/50 resize-none disabled:opacity-50"
            />
            <button
              onClick={handleSend}
              disabled={isStreaming || !input.trim()}
              className="px-3 py-2 bg-accent text-bg text-sm font-sans rounded hover:bg-accent/90 transition-colors disabled:opacity-50 self-end"
            >
              Send
            </button>
          </div>
          <div className="flex items-center justify-between">
            <button
              onClick={() => void handleFinalize()}
              disabled={isStreaming || messages.length === 0 || finalizing}
              className="text-xs font-mono text-muted hover:text-accent transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {finalizing ? 'Saving…' : 'Save lesson ↑'}
            </button>
            {(messages.length > 0 || successBanner) && (
              <button
                onClick={() => {
                  clearConversation()
                  setFinalizedResult(null)
                  setSuccessBanner(null)
                }}
                disabled={isStreaming}
                className="text-xs font-mono text-muted/60 hover:text-muted transition-colors"
              >
                Clear
              </button>
            )}
          </div>
          {finalizeError && <p className="text-xs font-mono text-red">{finalizeError}</p>}
        </div>
      )}
    </div>
  )
}

// ─── Application log type options ─────────────────────────────────────────────

const LOG_TYPE_OPTIONS = [
  { value: 'general',      label: 'General' },
  { value: 'compensation', label: 'Compensation' },
  { value: 'feedback',     label: 'Feedback' },
  { value: 'email_comms',  label: 'Email Comms' },
  { value: 'phone_comms',  label: 'Phone Comms' },
  { value: 'offer',        label: 'Offer' },
  { value: 'rejection',    label: 'Rejection' },
]

const ALL_STATUSES = [
  'not-started', 'draft', 'skipped', 'applied', 'screening',
  'interview', 'offer', 'rejected', 'ghosted', 'withdrawn',
] as const

// ─── Expandable log row (ADD EVENT + ADD APPLICATION NOTE sections) ────────────

interface AppLogRowProps {
  log: ApplicationLog
  typeOptions: { value: string; label: string }[]
  applicationId: number
  canDelete?: boolean
  canEditTimestamp?: boolean
  onDataChanged: () => void
}

function AppLogRow({
  log,
  typeOptions,
  applicationId,
  canDelete,
  canEditTimestamp,
  onDataChanged,
}: AppLogRowProps): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState(false)
  const [tsModalOpen, setTsModalOpen] = useState(false)
  const deleteLogMutation = useDeleteLog()
  const patchLogTs = usePatchLogTimestamp()

  const typeLabel = typeOptions.find((o) => o.value === log.type_value)?.label ?? log.type_value

  function handleDelete(): void {
    if (!deleteConfirm) { setDeleteConfirm(true); return }
    deleteLogMutation.mutate(
      { applicationId, logId: log.id },
      { onSuccess: () => { setDeleteConfirm(false); onDataChanged() } },
    )
  }

  return (
    <div className="bg-surface2 rounded mb-0.5 last:mb-0 hover:bg-[#2a2a2a] transition-colors">
      <div
        className="flex items-center justify-between px-2 py-2 cursor-pointer select-none"
        onClick={() => setOpen((o) => !o)}
      >
        <div className="flex items-center gap-3 min-w-0">
          {canEditTimestamp ? (
            <button
              className="text-[10px] font-mono text-muted hover:text-accent underline decoration-dotted shrink-0"
              onClick={(e) => { e.stopPropagation(); setTsModalOpen(true) }}
            >
              {fmtDateTime(log.log_timestamp)}
            </button>
          ) : (
            <span className="text-[10px] font-mono text-muted shrink-0">{fmtDateTime(log.log_timestamp)}</span>
          )}
          <span className="text-xs font-mono text-muted truncate">{typeLabel}</span>
        </div>
        <div
          className="flex items-center gap-2 shrink-0 ml-2"
          onClick={(e) => e.stopPropagation()}
        >
          {canDelete && (
            <button
              onClick={handleDelete}
              disabled={deleteLogMutation.isPending}
              className={`text-[10px] font-mono px-1.5 py-0.5 border rounded transition-colors disabled:opacity-50 ${
                deleteConfirm
                  ? 'border-red text-red'
                  : 'border-surface2 text-muted hover:text-red hover:border-red'
              }`}
            >
              {deleteConfirm ? 'Confirm?' : 'Delete'}
            </button>
          )}
          <span className="text-muted text-xs">{open ? '▲' : '▼'}</span>
        </div>
      </div>
      {open && (
        <div className="px-2 pb-2 border-t border-surface pt-2 space-y-1">
          {log.log && <p className="text-xs text-text leading-relaxed whitespace-pre-wrap">{log.log}</p>}
          {log.url && (
            <a
              href={log.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-accent hover:underline break-all block"
            >
              {log.url}
            </a>
          )}
          {!log.log && !log.url && <p className="text-xs text-muted italic">No content.</p>}
        </div>
      )}
      {tsModalOpen && (
        <TimestampModal
          current={log.log_timestamp}
          onSave={(ts) => {
            patchLogTs.mutate(
              { applicationId, logId: log.id, timestamp: ts },
              { onSuccess: () => { setTsModalOpen(false); onDataChanged() } },
            )
          }}
          onClose={() => setTsModalOpen(false)}
        />
      )}
    </div>
  )
}

// ─── Expandable question row ──────────────────────────────────────────────────

interface QuestionRowProps {
  question: ApplicationQuestion
  applicationId: number
  jobId: number
}

function QuestionRow({ question, applicationId, jobId }: QuestionRowProps): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState(false)
  const [editQ, setEditQ] = useState(question.question)
  const [editR, setEditR] = useState(question.response ?? '')
  const [deleteConfirm, setDeleteConfirm] = useState(false)
  const update = useUpdateApplicationQuestion()
  const del = useDeleteApplicationQuestion()
  const qc = useQueryClient()

  const preview = question.question.length > 80
    ? question.question.slice(0, 80) + '…'
    : question.question

  async function handleSave(): Promise<void> {
    await update.mutateAsync({
      applicationId,
      questionId: question.id,
      question: editQ.trim() || undefined,
      response: editR.trim() || null,
    })
    setEditing(false)
  }

  function handleDelete(): void {
    if (!deleteConfirm) { setDeleteConfirm(true); return }
    del.mutate(
      { applicationId, questionId: question.id },
      { onSuccess: () => {
        void qc.invalidateQueries({ queryKey: ['activity-log', jobId] })
        setDeleteConfirm(false)
      }},
    )
  }

  return (
    <div className="bg-surface2 rounded mb-0.5 last:mb-0 hover:bg-[#2a2a2a] transition-colors">
      <div
        className="flex items-center gap-2 px-2 py-2 select-none"
        onClick={() => { if (!editing) setOpen((o) => !o) }}
        style={{ cursor: editing ? 'default' : 'pointer' }}
      >
        <div className="flex-1 min-w-0">
          <p className="text-xs font-mono text-muted truncate">{preview}</p>
          <p className="text-[10px] font-mono text-muted/60">{fmtDate(question.created_at)}</p>
        </div>
        <div
          className="flex items-center gap-1.5 shrink-0"
          onClick={(e) => e.stopPropagation()}
        >
          <button
            onClick={() => { setEditing((v) => !v); setOpen(true) }}
            className="text-[10px] font-mono text-muted hover:text-accent border border-surface2 rounded px-1.5 py-0.5 transition-colors"
          >
            Edit
          </button>
          <button
            onClick={handleDelete}
            disabled={del.isPending}
            className={`text-[10px] font-mono px-1.5 py-0.5 border rounded transition-colors disabled:opacity-50 ${
              deleteConfirm
                ? 'border-red text-red'
                : 'border-surface2 text-muted hover:text-red hover:border-red'
            }`}
          >
            {deleteConfirm ? 'Confirm?' : 'Delete'}
          </button>
          <span className="text-[10px] text-muted">{open ? '▲' : '▼'}</span>
        </div>
      </div>
      {open && (
        <div className="px-2 pb-3 border-t border-surface pt-2 space-y-3">
          {editing ? (
            <div className="space-y-2">
              <label className="block">
                <span className="text-[10px] font-mono text-muted uppercase tracking-widest block">Question</span>
                <textarea
                  className="mt-1 w-full h-20 bg-surface2 rounded px-3 py-2 text-text text-sm font-mono focus:outline-none focus:ring-1 focus:ring-accent resize-y"
                  value={editQ}
                  onChange={(e) => setEditQ(e.target.value)}
                />
              </label>
              <label className="block">
                <span className="text-[10px] font-mono text-muted uppercase tracking-widest block">Response</span>
                <textarea
                  className="mt-1 w-full h-20 bg-surface2 rounded px-3 py-2 text-text text-sm font-mono focus:outline-none focus:ring-1 focus:ring-accent resize-y"
                  value={editR}
                  onChange={(e) => setEditR(e.target.value)}
                  placeholder="Your answer…"
                />
              </label>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => void handleSave()}
                  disabled={update.isPending || !editQ.trim()}
                  className="px-3 py-1.5 text-xs bg-accent text-bg rounded hover:bg-accent/90 disabled:opacity-50 transition-colors"
                >
                  {update.isPending ? 'Saving…' : 'Save'}
                </button>
                <button
                  onClick={() => { setEditing(false); setEditQ(question.question); setEditR(question.response ?? '') }}
                  className="px-3 py-1.5 text-xs text-muted hover:text-text transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <>
              <div>
                <p className="text-[10px] font-mono text-muted uppercase tracking-widest mb-1">Question</p>
                <p className="text-xs text-text leading-relaxed whitespace-pre-wrap">{question.question}</p>
              </div>
              {question.response ? (
                <div>
                  <p className="text-[10px] font-mono text-muted uppercase tracking-widest mb-1">Response</p>
                  <p className="text-xs text-text leading-relaxed whitespace-pre-wrap">{question.response}</p>
                </div>
              ) : (
                <p className="text-xs text-muted italic">No response yet.</p>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Evaluation expanded card (C7) ───────────────────────────────────────────

function fmtScoreLabel(val: number | null): string {
  return val != null ? `${val.toFixed(1)}/10` : '—'
}

function EvalExpandedCard({ evalData }: { evalData: ActivityLogEvalData }): React.JSX.Element {
  const scores: Array<[string, number | null]> = [
    ['Overall',  evalData.score_overall],
    ['Role Fit', evalData.score_role_fit],
    ['Scope',    evalData.score_scope_fit],
    ['Culture',  evalData.score_culture],
    ['Comp',     evalData.score_comp],
  ]
  const recColor =
    evalData.recommendation === 'Apply'       ? 'text-green' :
    evalData.recommendation === 'Skip'        ? 'text-red'   :
    evalData.recommendation === 'Apply with modifications' ? 'text-accent' :
    'text-text'

  return (
    <div className="space-y-2 py-1">
      {/* Scores row */}
      <div className="flex flex-wrap gap-x-4 gap-y-1">
        {scores.map(([label, val]) => (
          <span key={label} className="text-[10px] font-mono text-muted">
            <span className="uppercase tracking-wider">{label}</span>
            <span className="text-text ml-1">{fmtScoreLabel(val)}</span>
          </span>
        ))}
      </div>

      {/* Fit type · archetype · recommendation */}
      <div className="flex flex-wrap gap-x-3 gap-y-1 text-[10px] font-mono">
        {evalData.fit_type && (
          <span className="text-muted">
            Fit: <span className="text-text">{evalData.fit_type}</span>
          </span>
        )}
        {evalData.archetype && (
          <span className="text-muted">
            Archetype: <span className="text-text">{evalData.archetype}</span>
          </span>
        )}
        {evalData.recommendation && (
          <span className="text-muted">
            Rec: <span className={recColor}>{evalData.recommendation}</span>
          </span>
        )}
      </div>

      {/* Domain / role type */}
      {(evalData.domain_match || evalData.role_type_match) && (
        <div className="flex flex-wrap gap-x-3 gap-y-1 text-[10px] font-mono text-muted">
          {evalData.domain_match && (
            <span>Domain: <span className="text-text">{evalData.domain_match}</span></span>
          )}
          {evalData.role_type_match && (
            <span>Role: <span className="text-text">{evalData.role_type_match}</span></span>
          )}
        </div>
      )}

      {/* Strengths */}
      {evalData.strengths && (
        <div>
          <p className="text-[10px] font-mono text-muted uppercase tracking-wider mb-0.5">Strengths</p>
          <p className="text-xs text-text leading-relaxed">{evalData.strengths}</p>
        </div>
      )}

      {/* Gaps */}
      {evalData.gaps && (
        <div>
          <p className="text-[10px] font-mono text-muted uppercase tracking-wider mb-0.5">Gaps</p>
          <p className="text-xs text-text leading-relaxed">{evalData.gaps}</p>
        </div>
      )}

      {/* Keywords */}
      {evalData.keywords && (
        <div>
          <p className="text-[10px] font-mono text-muted uppercase tracking-wider mb-0.5">Keywords</p>
          <p className="text-xs font-mono text-muted leading-relaxed">{evalData.keywords}</p>
        </div>
      )}

      {/* Keyword gaps */}
      {evalData.keyword_gaps && (
        <div>
          <p className="text-[10px] font-mono text-muted uppercase tracking-wider mb-0.5">Keyword Gaps</p>
          <p className="text-xs font-mono text-muted leading-relaxed">{evalData.keyword_gaps}</p>
        </div>
      )}
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
  job_posting:          'bg-surface2 text-muted/60',
  application_question: 'bg-blue-500/10 text-blue-400',
}

interface ActivityLogRowProps {
  entry: ActivityLogEntry
  applicationId: number | null
  onTimestampSaved: () => void
  llmCallEntry?: LlmCallLogEntry
}

function ActivityLogRow({ entry, applicationId, onTimestampSaved, llmCallEntry }: ActivityLogRowProps): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState(false)
  const [tsModalOpen, setTsModalOpen] = useState(false)
  const [copied, setCopied] = useState(false)
  const patchLogTs = usePatchLogTimestamp()
  const patchAuditTs = usePatchAuditTimestamp()
  const deleteLog = useDeleteLog()

  const badgeClass = BADGE_CLASSES[entry.entry_type] ?? 'bg-surface2 text-muted'
  const hasContent = !!(entry.text ?? entry.url)

  // C5: for audit rows surface the event text in the info column; all others use source
  const headerInfoText = entry.entry_type === 'audit' ? (entry.text ?? entry.source) : entry.source

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
    <div className="bg-surface2 rounded mb-0.5 last:mb-0 hover:bg-[#2a2a2a] transition-colors">
      {/* Rolled-up header — click anywhere toggles; Copy and Toggle are stopPropagation */}
      <div
        className="flex items-center px-2 py-2 cursor-pointer select-none"
        onClick={() => setOpen((o) => !o)}
      >
        {/* Timestamp 20% — plain, non-interactive */}
        <span className="text-[10px] font-mono text-muted shrink-0 w-1/5 truncate pr-1">
          {fmtDateTime(entry.timestamp)}
        </span>

        {/* Type badge 15% */}
        <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded shrink-0 w-[15%] truncate ${badgeClass}`}>
          {entry.entry_type.replace('_', ' ')}
        </span>

        {/* Info 50% — source text; audit entries show event text (C5) */}
        <span className="text-[10px] font-mono text-muted flex-1 truncate min-w-0 px-1">
          {headerInfoText}
        </span>

        {/* Copy 10% — stopPropagation */}
        <div
          className="shrink-0 w-[10%] flex justify-center"
          onClick={(e) => e.stopPropagation()}
        >
          {hasContent && (
            <button
              onClick={copyText}
              className="text-[10px] font-mono text-muted hover:text-accent transition-colors px-1.5 py-0.5 border border-surface2 rounded"
            >
              {copied ? '✓' : 'Copy'}
            </button>
          )}
        </div>

        {/* Toggle 5% — stopPropagation */}
        <button
          className="shrink-0 w-[5%] text-[10px] text-muted hover:text-text transition-colors text-center"
          onClick={(e) => { e.stopPropagation(); setOpen((o) => !o) }}
        >
          {open ? '▲' : '▼'}
        </button>
      </div>

      {/* Expanded row */}
      {open && (
        <div className="flex items-start border-t border-surface pt-2 pb-3 px-2 gap-2">
          {/* Reserved 20% — Edit Timestamp button */}
          <div className="shrink-0 w-1/5">
            {entry.can_edit_timestamp && (
              <button
                className="text-[10px] font-mono text-muted hover:text-accent underline decoration-dotted"
                onClick={() => setTsModalOpen(true)}
              >
                Edit Timestamp
              </button>
            )}
          </div>

          {/* Info 65% — rich view per entry_type */}
          <div className="flex-1 min-w-0 space-y-1">
            {entry.entry_type === 'llm_call' && llmCallEntry ? (
              <LlmExpandedRow entry={llmCallEntry} />
            ) : entry.entry_type === 'evaluation' && entry.eval_data ? (
              <EvalExpandedCard evalData={entry.eval_data} />
            ) : (
              <>
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
                    className="text-xs text-accent hover:underline break-all block"
                  >
                    {entry.url}
                  </a>
                ) : null}
                {!entry.text && !entry.url && (
                  <p className="text-xs text-muted italic">No content.</p>
                )}
              </>
            )}
          </div>

          {/* Delete 10% */}
          <div className="shrink-0 w-[10%] flex justify-end">
            {entry.can_delete && (
              <button
                onClick={() => {
                  if (deleteConfirm) {
                    if (applicationId !== null && entry.raw_id !== null) {
                      deleteLog.mutate(
                        { applicationId, logId: entry.raw_id },
                        { onSuccess: () => { setDeleteConfirm(false); onTimestampSaved() } },
                      )
                    } else {
                      setDeleteConfirm(false)
                    }
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
          </div>

          {/* Reserved 5% */}
          <div className="shrink-0 w-[5%]" />
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

type JobDetailsAction = 'job-details' | 'job-description' | 'company-info' | 'job-actions'

interface JobDetailsLeftProps {
  jobId: number
  active: JobDetailsAction
  onSelect: (a: JobDetailsAction) => void
}

function JobDetailsLeft({ jobId: _jobId, active, onSelect }: JobDetailsLeftProps): React.JSX.Element {
  const infoActions: { id: JobDetailsAction; label: string }[] = [
    { id: 'job-details',     label: 'Job Detail Summary' },
    { id: 'job-description', label: 'Job Description' },
    { id: 'company-info',    label: 'Company Info' },
  ]

  return (
    <>
      {/* JOB INFO */}
      <div className="space-y-0.5 mb-4">
        <p className="text-[10px] font-mono text-muted uppercase tracking-widest mb-2">Job Info</p>
        {infoActions.map(({ id, label }) => (
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

      {/* ACTIONS */}
      <div className="space-y-0.5">
        <p className="text-[10px] font-mono text-muted uppercase tracking-widest mb-2">Actions</p>
        <button
          onClick={() => onSelect('job-actions')}
          className={`w-full text-left px-3 py-2 text-sm font-mono rounded-r transition-colors ${
            active === 'job-actions'
              ? 'bg-surface2 text-accent border-l-2 border-accent'
              : 'text-muted hover:text-text'
          }`}
        >
          Job Actions
        </button>
      </div>
    </>
  )
}

// ─── JOB DETAILS tab — right column ──────────────────────────────────────────

interface JobDetailsRightProps {
  jobId: number
  job: Job
  applicationId: number
  companyLog: CompanyLogEntry[]
  activeAction: JobDetailsAction
}

function JobDetailsRight({
  jobId,
  job,
  companyLog,
  activeAction,
}: JobDetailsRightProps): React.JSX.Element {
  const [editDescOpen, setEditDescOpen] = useState(false)
  const [descCopied, setDescCopied] = useState(false)
  const [savedInfo, setSavedInfo] = useState(false)
  const [collapseSignal, setCollapseSignal] = useState(0)
  const [ratingsOpen, setRatingsOpen] = useState(false)
  const [jobInfoOpen, setJobInfoOpen] = useState(false)
  const [editSummaryOpen, setEditSummaryOpen] = useState(false)
  const [summaryPromptText, setSummaryPromptText] = useState<string | null>(null)
  const [exportStatus, setExportStatus] = useState<'idle' | 'loading' | 'done' | 'error'>('idle')
  const generateOrgSummaryPrompt = useGenerateOrgSummaryPrompt()
  const patch = usePatchJob()

  function exportJob(): void {
    setExportStatus('loading')
    fetch(`/api/v1/jobs/${jobId}/export`, { method: 'POST' })
      .then((res) => {
        if (!res.ok) throw new Error('export failed')
        setExportStatus('done')
        setTimeout(() => setExportStatus('idle'), 2000)
      })
      .catch(() => {
        setExportStatus('error')
        setTimeout(() => setExportStatus('idle'), 2000)
      })
  }

  function fmtRating(val: number | null, max: number): string {
    if (val === null || val === undefined) return '—'
    return `${val.toFixed(1)} /${max}`
  }

  const excitementNum = job.excitement_level !== null
    ? (isNaN(parseInt(job.excitement_level, 10)) ? null : parseInt(job.excitement_level, 10))
    : null

  function copyDescription(): void {
    if (!job.description_merged) return
    void navigator.clipboard.writeText(job.description_merged).then(() => {
      setDescCopied(true)
      setTimeout(() => setDescCopied(false), 1500)
    })
  }

  // ── JOB DETAILS view ────────────────────────────────────────────────────────
  if (activeAction === 'job-details') {
    return (
      <>
        <div className="space-y-5">
          {/* Excitement */}
          <div>
            <p className="text-[10px] font-mono text-muted uppercase tracking-widest mb-1.5">Excitement</p>
            <StarRating
              value={excitementNum}
              onChange={(val) => patch.mutate({ jobId, updates: { excitement_level: String(val) } })}
            />
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
                ['Company',  job.company_name],
                ['Title',    job.title],
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
        </div>

        {job.description_merged ? (
          <div className="border border-surface2 rounded bg-surface2/40 p-4">
            <pre className="text-xs text-text font-sans leading-relaxed whitespace-pre-wrap break-words">
              {job.description_merged}
            </pre>
          </div>
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

  // ── JOB ACTIONS view ─────────────────────────────────────────────────────────
  if (activeAction === 'job-actions') {
    return (
      <div className="space-y-3">
        <button
          onClick={exportJob}
          disabled={exportStatus === 'loading'}
          className="px-3 py-1.5 text-xs font-mono text-muted border border-surface2 rounded hover:text-text hover:border-accent/40 transition-colors disabled:opacity-50"
        >
          {exportStatus === 'loading' ? 'Exporting…' : exportStatus === 'done' ? 'Exported!' : exportStatus === 'error' ? 'Error' : 'Export Job'}
        </button>
        <p className="text-[10px] text-muted leading-snug">
          Exports main job data to the inbox/done/ folder. Use this to save a copy or import into a new instance.
        </p>
      </div>
    )
  }

  // ── COMPANY INFO view ────────────────────────────────────────────────────────
  return (
    <>
      {/* COMPANY SUMMARY */}
      <p className="text-[10px] font-mono text-muted uppercase tracking-widest mb-2">Company Summary</p>
      {(() => {
        const summaryEntry = companyLog.find((e) => e.type_value === 'summary')
        return summaryEntry?.log ? (
          <p className="text-sm text-text leading-relaxed mb-3">{summaryEntry.log}</p>
        ) : (
          <p className="text-sm text-muted italic mb-3">No summary yet.</p>
        )
      })()}
      <div className="flex gap-2 mb-6">
        <button
          onClick={() => setEditSummaryOpen(true)}
          className="px-3 py-1.5 text-xs font-mono text-muted border border-surface2 rounded hover:text-text hover:border-accent/40 transition-colors"
        >
          Edit Summary
        </button>
        <button
          onClick={() => {
            generateOrgSummaryPrompt.mutate(jobId, {
              onSuccess: (data) => setSummaryPromptText(data.prompt),
            })
          }}
          disabled={generateOrgSummaryPrompt.isPending}
          className="px-3 py-1.5 text-xs font-mono text-muted border border-surface2 rounded hover:text-text hover:border-accent/40 transition-colors disabled:opacity-50"
        >
          {generateOrgSummaryPrompt.isPending ? 'Generating…' : 'Generate External Summary Prompt'}
        </button>
      </div>

      <CompanyInfoInlineForm jobId={jobId} onSaved={() => setSavedInfo(!savedInfo)} />

      <p className="text-[10px] font-mono text-muted uppercase tracking-widest mb-2">Company Info</p>

      {companyLog.length === 0 ? (
        <p className="text-sm text-muted italic">No company info yet.</p>
      ) : (
        <div>
          <div className="flex justify-end mb-1">
            <button
              onClick={() => setCollapseSignal((s) => s + 1)}
              className="text-[10px] font-mono text-muted hover:text-text transition-colors uppercase tracking-widest"
            >
              Collapse All
            </button>
          </div>
          {companyLog.map((entry) => (
            <CompanyLogRow key={entry.id} entry={entry} collapseSignal={collapseSignal} />
          ))}
        </div>
      )}

      {editSummaryOpen && (
        <EditSummaryModal
          jobId={jobId}
          initial={companyLog.find((e) => e.type_value === 'summary')?.log ?? ''}
          onClose={() => setEditSummaryOpen(false)}
        />
      )}
      {summaryPromptText !== null && (
        <PromptModal
          prompt={summaryPromptText}
          title="Generate External Summary Prompt"
          onClose={() => setSummaryPromptText(null)}
        />
      )}
    </>
  )
}

// ─── APPLICATION tab — left column ───────────────────────────────────────────

type AppAction =
  | 'application-details'
  | 'apply-workflow'
  | 'evaluations'
  | 'resume'
  | 'cover-letter'
  | 'add-note'
  | 'questions'
  | 'lesson'

interface ApplicationLeftProps {
  active: AppAction
  onSelect: (a: AppAction) => void
}

function ApplicationLeft({ active, onSelect }: ApplicationLeftProps): React.JSX.Element {
  const actions: { id: AppAction; label: string }[] = [
    { id: 'application-details', label: 'Application Details' },
    { id: 'apply-workflow',      label: 'Apply Workflow' },
    { id: 'evaluations',         label: 'Evaluations' },
    { id: 'resume',              label: 'Resume' },
    { id: 'cover-letter',        label: 'Cover Letter' },
    { id: 'add-note',            label: 'Add App Note/Comms' },
    { id: 'questions',           label: 'Application Questions' },
    { id: 'lesson',              label: 'Add Lesson' },
  ]

  return (
    <div className="space-y-0.5">
      <p className="text-[10px] font-mono text-muted uppercase tracking-widest mb-2">Application Info</p>
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
  )
}

// ─── APPLICATION tab — right column ──────────────────────────────────────────

interface ApplicationRightProps {
  jobId: number
  job: Job
  applicationId: number
  application: Application
  evaluations: EvalWithMeta[]
  logs: ApplicationLog[]
  postings: JobPosting[]
  activeAction: AppAction
  typstAvailable: boolean
  onDataChanged: () => void
  onImportEval: () => void
  onSelectAction: (a: AppAction) => void
}

function ApplicationRight({
  jobId,
  job,
  applicationId,
  application,
  evaluations,
  logs,
  postings,
  activeAction,
  typstAvailable,
  onDataChanged,
  onImportEval,
  onSelectAction,
}: ApplicationRightProps): React.JSX.Element {
  const patch = usePatchApplication()
  const addLog = useAddLog()
  const { data: questions = [] } = useApplicationQuestions(applicationId)
  const createQuestion = useCreateApplicationQuestion()
  const qc = useQueryClient()

  const [newStatus, setNewStatus] = useState(application.application_status)
  const [statusNote, setStatusNote] = useState('')
  const [applyDate, setApplyDate] = useState(application.apply_date ?? '')
  const [endDate, setEndDate] = useState(application.end_date ?? '')
  const [requestedSalary, setRequestedSalary] = useState(application.requested_salary ?? '')
  const [detailsSaved, setDetailsSaved] = useState(false)

  const [noteType, setNoteType] = useState(LOG_TYPE_OPTIONS[0]!.value)
  const [noteText, setNoteText] = useState('')
  const [noteUrl, setNoteUrl] = useState('')

  const [newQ, setNewQ] = useState('')
  const [newR, setNewR] = useState('')

  const isApplied = application.applied === 1
  const applyUrl = postings.find((p) => p.source_url)?.source_url ?? null
  const statusChanged = newStatus !== application.application_status

  const LOG_VALUES = new Set(LOG_TYPE_OPTIONS.map((o) => o.value))
  const noteLogs = logs.filter((l) => LOG_VALUES.has(l.type_value))

  async function handleSaveDetails(): Promise<void> {
    await patch.mutateAsync({
      applicationId,
      updates: {
        apply_date: applyDate || undefined,
        end_date: endDate || undefined,
        requested_salary: requestedSalary || undefined,
      },
    })
    setDetailsSaved(true)
    setTimeout(() => setDetailsSaved(false), 2000)
  }

  async function handleChangeStatus(): Promise<void> {
    const logText = statusNote.trim() || `Status changed to ${newStatus}`
    try {
      await patch.mutateAsync({ applicationId, updates: { application_status: newStatus } })
      await addLog.mutateAsync({ applicationId, type_value: 'status_change', log: logText })
      setStatusNote('')
      onDataChanged()
    } catch {
      // errors surfaced via patch.isError / addLog.isError
    }
  }

  async function handleAddNote(e: React.FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault()
    if (!noteText.trim()) return
    await addLog.mutateAsync({ applicationId, type_value: noteType, log: noteText.trim(), url: noteUrl.trim() || undefined })
    setNoteText('')
    setNoteUrl('')
    onDataChanged()
  }

  async function handleCreateQuestion(e: React.FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault()
    if (!newQ.trim()) return
    await createQuestion.mutateAsync({ applicationId, jobId, question: newQ.trim(), response: newR.trim() || undefined })
    setNewQ('')
    setNewR('')
  }

  // ── APPLICATION DETAILS view ────────────────────────────────────────────────
  if (activeAction === 'application-details') {
    return (
      <div className="space-y-5">
        {/* Row 1 — Status · Apply button · Apply URL */}
        <div className="grid grid-cols-3 gap-4">
          <div>
            <span className="text-[10px] font-mono text-muted uppercase tracking-widest block mb-1">Status</span>
            <span className="text-sm text-text font-mono">{application.application_status}</span>
          </div>
          <div>
            <span className="text-[10px] font-mono text-muted uppercase tracking-widest block mb-1">&nbsp;</span>
            <button
              onClick={() => patch.mutate({ applicationId, updates: { applied: 1, application_status: 'applied' } })}
              disabled={isApplied || patch.isPending}
              className={`px-4 py-1.5 text-sm rounded transition-colors disabled:opacity-60 ${
                isApplied ? 'bg-green/20 text-green cursor-default' : 'bg-accent text-bg hover:bg-accent/90'
              }`}
            >
              {isApplied ? 'Applied ✓' : 'I APPLIED!'}
            </button>
          </div>
          <div>
            <span className="text-[10px] font-mono text-muted uppercase tracking-widest block mb-1">Apply URL</span>
            {applyUrl ? (
              <a
                href={applyUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-accent hover:underline break-all"
              >
                {applyUrl}
              </a>
            ) : (
              <span className="text-xs text-muted italic">—</span>
            )}
          </div>
        </div>

        {/* Row 2 — Apply Date · Requested Salary · End Date · Save */}
        <div className="flex items-end gap-3">
          <label className="block flex-1">
            <span className="text-[10px] font-mono text-muted uppercase tracking-widest block mb-1">Apply Date</span>
            <input
              type="date"
              className="w-full bg-surface2 rounded px-3 py-1.5 text-text text-sm focus:outline-none focus:ring-1 focus:ring-accent"
              value={applyDate}
              onChange={(e) => setApplyDate(e.target.value)}
            />
          </label>
          <label className="block flex-1">
            <span className="text-[10px] font-mono text-muted uppercase tracking-widest block mb-1">Requested Salary</span>
            <input
              type="text"
              className="w-full bg-surface2 rounded px-3 py-1.5 text-text text-sm font-mono focus:outline-none focus:ring-1 focus:ring-accent"
              placeholder="e.g. $120k"
              value={requestedSalary}
              onChange={(e) => setRequestedSalary(e.target.value)}
            />
          </label>
          <label className="block flex-1">
            <span className="text-[10px] font-mono text-muted uppercase tracking-widest block mb-1">End Date</span>
            <input
              type="date"
              className="w-full bg-surface2 rounded px-3 py-1.5 text-text text-sm focus:outline-none focus:ring-1 focus:ring-accent"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
            />
          </label>
          <button
            onClick={() => void handleSaveDetails()}
            disabled={patch.isPending}
            className="px-4 py-1.5 text-sm bg-accent text-bg rounded hover:bg-accent/90 disabled:opacity-50 transition-colors shrink-0"
          >
            {detailsSaved ? 'Saved!' : patch.isPending ? 'Saving…' : 'Save'}
          </button>
        </div>

        <hr className="border-surface2" />

        {/* Row 3 — Change Status */}
        <label className="block">
          <span className="text-[10px] font-mono text-muted uppercase tracking-widest block mb-1">Change Status</span>
          <select
            className="w-full bg-surface2 rounded px-3 py-1.5 text-text text-sm focus:outline-none focus:ring-1 focus:ring-accent"
            value={newStatus}
            onChange={(e) => setNewStatus(e.target.value as ApplicationStatus)}
          >
            {ALL_STATUSES.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </label>

        {/* Row 4 — Reason */}
        <label className="block">
          <span className="text-[10px] font-mono text-muted uppercase tracking-widest block mb-1">Reason for Change (Optional)</span>
          <textarea
            className="w-full h-16 bg-surface2 rounded px-3 py-1.5 text-text text-sm font-mono focus:outline-none focus:ring-1 focus:ring-accent resize-y"
            value={statusNote}
            onChange={(e) => setStatusNote(e.target.value)}
            placeholder="Add a note…"
          />
        </label>

        {(patch.isError || addLog.isError) && (
          <p className="text-red text-xs">{patch.error?.message ?? addLog.error?.message}</p>
        )}

        {/* Row 5 — Save (status change) */}
        <button
          onClick={() => void handleChangeStatus()}
          disabled={!statusChanged || patch.isPending || addLog.isPending}
          className="px-4 py-1.5 text-sm bg-accent text-bg rounded hover:bg-accent/90 disabled:opacity-50 transition-colors"
        >
          {(patch.isPending || addLog.isPending) ? 'Saving…' : 'Save'}
        </button>
      </div>
    )
  }

  // ── APPLY WORKFLOW view ─────────────────────────────────────────────────────
  if (activeAction === 'apply-workflow') {
    return (
      <ApplyWorkflow
        jobId={jobId}
        applicationId={applicationId}
        evaluations={evaluations}
        typstAvailable={typstAvailable}
        onImportEval={onImportEval}
        onNavigateToEvals={() => onSelectAction('evaluations')}
        onNavigateToResume={() => onSelectAction('resume')}
      />
    )
  }

  // ── EVALUATIONS view ────────────────────────────────────────────────────────
  if (activeAction === 'evaluations') {
    return (
      <>
        {/* Agg score row */}
        <div className="flex items-center gap-4 flex-wrap mb-6 pb-4 border-b border-surface2">
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
      </>
    )
  }

  // ── RESUME view ─────────────────────────────────────────────────────────────
  if (activeAction === 'resume') {
    return (
      <ResumeSubpage applicationId={applicationId} typstAvailable={typstAvailable} />
    )
  }

  // ── COVER LETTER view ────────────────────────────────────────────────────────
  if (activeAction === 'cover-letter') {
    return (
      <CoverLetterSubpage applicationId={applicationId} typstAvailable={typstAvailable} />
    )
  }

  // ── ADD APPLICATION NOTE view ────────────────────────────────────────────────
  if (activeAction === 'add-note') {
    return (
      <>
        <form onSubmit={(e) => void handleAddNote(e)} className="space-y-3 pb-4 border-b border-surface2 mb-4">
          <p className="text-[10px] font-mono text-muted uppercase tracking-widest">Add App Note/Comms</p>
          <label className="block">
            <span className="text-[10px] font-mono text-muted uppercase tracking-widest block">Type</span>
            <select
              className="mt-1 w-full bg-surface2 rounded px-3 py-2 text-text text-sm focus:outline-none focus:ring-1 focus:ring-accent"
              value={noteType}
              onChange={(e) => setNoteType(e.target.value)}
            >
              {LOG_TYPE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="text-[10px] font-mono text-muted uppercase tracking-widest block">Notes</span>
            <textarea
              className="mt-1 w-full h-20 bg-surface2 rounded px-3 py-2 text-text text-sm font-mono focus:outline-none focus:ring-1 focus:ring-accent resize-y"
              value={noteText}
              onChange={(e) => setNoteText(e.target.value)}
              placeholder="Note…"
            />
          </label>
          <label className="block">
            <span className="text-[10px] font-mono text-muted uppercase tracking-widest block">URL</span>
            <input
              type="url"
              className="mt-1 w-full bg-surface2 rounded px-3 py-2 text-text text-sm font-mono focus:outline-none focus:ring-1 focus:ring-accent"
              value={noteUrl}
              onChange={(e) => setNoteUrl(e.target.value)}
              placeholder="https://… (optional)"
            />
          </label>
          {addLog.isError && <p className="text-red text-xs">{addLog.error.message}</p>}
          <button
            type="submit"
            disabled={addLog.isPending || !noteText.trim()}
            className="px-4 py-2 text-sm bg-accent text-bg rounded hover:bg-accent/90 disabled:opacity-50 transition-colors"
          >
            {addLog.isPending ? 'Saving…' : 'Save Note'}
          </button>
        </form>

        {noteLogs.length === 0 ? (
          <p className="text-xs text-muted italic">No notes yet.</p>
        ) : (
          <div>
            {noteLogs.map((log) => (
              <AppLogRow
                key={log.id}
                log={log}
                typeOptions={LOG_TYPE_OPTIONS}
                applicationId={applicationId}
                canDelete
                canEditTimestamp
                onDataChanged={onDataChanged}
              />
            ))}
          </div>
        )}
      </>
    )
  }

  // ── APPLICATION QUESTIONS view ───────────────────────────────────────────────
  if (activeAction === 'questions') {
    return (
      <>
        <form onSubmit={(e) => void handleCreateQuestion(e)} className="space-y-3 pb-4 border-b border-surface2 mb-4">
          <p className="text-[10px] font-mono text-muted uppercase tracking-widest">Application Questions</p>
          <label className="block">
            <span className="text-[10px] font-mono text-muted uppercase tracking-widest block">Question</span>
            <textarea
              className="mt-1 w-full h-20 bg-surface2 rounded px-3 py-2 text-text text-sm font-mono focus:outline-none focus:ring-1 focus:ring-accent resize-y"
              value={newQ}
              onChange={(e) => setNewQ(e.target.value)}
              placeholder="Paste the application question…"
            />
          </label>
          <label className="block">
            <span className="text-[10px] font-mono text-muted uppercase tracking-widest block">Response</span>
            <textarea
              className="mt-1 w-full h-20 bg-surface2 rounded px-3 py-2 text-text text-sm font-mono focus:outline-none focus:ring-1 focus:ring-accent resize-y"
              value={newR}
              onChange={(e) => setNewR(e.target.value)}
              placeholder="Your answer…"
            />
          </label>
          {createQuestion.isError && (
            <p className="text-red text-xs">{createQuestion.error.message}</p>
          )}
          <button
            type="submit"
            disabled={createQuestion.isPending || !newQ.trim()}
            className="px-4 py-2 text-sm bg-accent text-bg rounded hover:bg-accent/90 disabled:opacity-50 transition-colors"
          >
            {createQuestion.isPending ? 'Saving…' : 'Save'}
          </button>
        </form>

        {questions.length === 0 ? (
          <p className="text-xs text-muted italic">No application questions captured yet.</p>
        ) : (
          <div>
            {questions.map((q) => (
              <QuestionRow
                key={q.id}
                question={q}
                applicationId={applicationId}
                jobId={jobId}
              />
            ))}
          </div>
        )}
      </>
    )
  }

  // ── ADD LESSON view ──────────────────────────────────────────────────────────
  return (
    <LessonCapturePanel
      applicationId={applicationId}
      jobTitle={job.title}
      companyName={job.company_name}
      onFinalized={() => {
        void qc.invalidateQueries({ queryKey: ['application', applicationId] })
        void qc.invalidateQueries({ queryKey: ['activity-log', jobId] })
      }}
    />
  )
}

// ─── Workspace page ───────────────────────────────────────────────────────────

// [DocRow moved to components/DocRow.tsx]
// [ResumeCoverTab moved to components/ResumeSubpage.tsx and CoverLetterSubpage.tsx]

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
  const { data: llmCallLogData = [] } =
    useLlmCallLog(activeTab === 'application-log' ? { job_id: jobId } : {})
  const llmCallMap = Object.fromEntries(llmCallLogData.map((e) => [e.id, e])) as Record<number, LlmCallLogEntry>

  // JOB DETAILS tab action state
  const [jobDetailsAction, setJobDetailsAction] = useState<JobDetailsAction>('job-details')

  // APPLY tab action state
  const [activeAppAction, setActiveAppAction] = useState<AppAction>('application-details')

  // Import modal state
  const [importOpen, setImportOpen] = useState(false)
  const [importError, setImportError] = useState('')
  const importMutation = useImportEvaluationMutation()
  // Post-import feedback flow
  const [importFeedbackInviteOpen, setImportFeedbackInviteOpen] = useState(false)
  const [importFeedbackModalOpen, setImportFeedbackModalOpen] = useState(false)
  const [importedPromptUsageId, _setImportedPromptUsageId] = useState<number | null>(null)
  const { data: models = [] } = useModels()
  const qc = useQueryClient()
  const { data: healthData } = useQuery({
    queryKey: ['health'],
    queryFn: async () => {
      const res = await fetch('/api/v1/health')
      if (!res.ok) throw new Error(`health ${res.status}`)
      return res.json() as Promise<{ typst_available: boolean }>
    },
  })
  const typstAvailable = healthData?.typst_available ?? false

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
      setImportFeedbackInviteOpen(true)
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
                  llmCallEntry={entry.entry_type === 'llm_call' && entry.raw_id != null ? llmCallMap[entry.raw_id] : undefined}
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
                active={jobDetailsAction}
                onSelect={setJobDetailsAction}
              />
            )}
            {activeTab === 'interview' && (
              <p className="text-[10px] font-mono text-muted uppercase tracking-widest">
                Nothing to configure yet.
              </p>
            )}
            {activeTab === 'apply' && (
              <ApplicationLeft
                active={activeAppAction}
                onSelect={setActiveAppAction}
              />
            )}
          </div>

          {/* Right column */}
          <div className="flex-1 overflow-y-auto p-6">
            {activeTab === 'job-details' && (
              <JobDetailsRight
                jobId={jobId}
                job={job}
                applicationId={applicationId ?? 0}
                companyLog={jobData.company_log}
                activeAction={jobDetailsAction}
              />
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
            {activeTab === 'apply' && (
              appLoading ? (
                <div className="p-6 text-muted text-sm">Loading application…</div>
              ) : appData && applicationId !== undefined ? (
                <ApplicationRight
                  jobId={jobId}
                  job={job}
                  applicationId={applicationId}
                  application={appData.application}
                  evaluations={evaluations}
                  logs={appData.logs}
                  postings={jobData.postings}
                  activeAction={activeAppAction}
                  typstAvailable={typstAvailable}
                  onDataChanged={() => {
                    void qc.invalidateQueries({ queryKey: ['activity-log', jobId] })
                  }}
                  onImportEval={() => setImportOpen(true)}
                  onSelectAction={setActiveAppAction}
                />
              ) : (
                <div className="p-6 text-muted text-sm">No application found.</div>
              )
            )}
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

      {/* Post-import feedback invite modal */}
      {importFeedbackInviteOpen && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
          <div className="bg-surface border border-surface2 rounded-xl p-7 max-w-sm w-full shadow-2xl">
            <p className="font-serif text-accent text-lg mb-1">Import successful.</p>
            <p className="text-sm text-muted mb-6 leading-relaxed">
              Would you like to add feedback on this evaluation?
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setImportFeedbackInviteOpen(false)}
                className="px-4 py-2 text-sm font-sans bg-surface2 text-muted border border-surface2 rounded hover:text-text transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  setImportFeedbackInviteOpen(false)
                  setImportFeedbackModalOpen(true)
                }}
                className="px-4 py-2 text-sm font-sans bg-accent text-bg rounded hover:bg-accent/90 transition-colors"
              >
                Add Feedback
              </button>
            </div>
          </div>
        </div>
      )}

      {/* External eval feedback modal */}
      {importedPromptUsageId !== null && (
        <EvaluationFeedbackButton
          promptUsageId={importedPromptUsageId}
          isOpen={importFeedbackModalOpen}
          onClose={() => setImportFeedbackModalOpen(false)}
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
  CompanyLogRow,
  StarRating,
  TimestampModal,
  COMPANY_INFO_TYPES,
  fmtDate,
  fmtDateTime,
}
