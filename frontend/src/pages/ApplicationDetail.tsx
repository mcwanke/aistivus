import { useState } from 'react'
import { Link } from 'react-router-dom'
import {
  useApplicationDetail,
  usePatchApplication,
  useAddLog,
  useDeleteLog,
  useGeneratePrompt,
} from '@/hooks/useApplications'
import type { ApplicationStatus, ApplicationLog, ApplicationAuditEntry, Evaluation } from '@/types/api'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  return iso.split('T')[0] ?? iso.slice(0, 10)
}

function fmtScore(val: number | null | undefined): string {
  if (val === null || val === undefined) return '—'
  return val.toFixed(1)
}

// ─── Status options (excludes not-started) ────────────────────────────────────

const STATUSES: ApplicationStatus[] = [
  'draft', 'applied', 'screening', 'interview', 'offer', 'rejected', 'ghosted', 'withdrawn',
]

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

// User-facing log types (exclude 'prompt' — those are auto-generated)
const LOG_TYPE_OPTIONS = [
  { value: 'recruiter_call',     label: 'Recruiter Call' },
  { value: 'interview_feedback', label: 'Interview Feedback' },
  { value: 'compensation',       label: 'Compensation' },
  { value: 'repost_alert',       label: 'Repost Alert' },
  { value: 'general',            label: 'General' },
]

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

// ─── Status badge ─────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: ApplicationStatus }): React.JSX.Element {
  return (
    <span className={`text-xs font-mono px-2 py-0.5 rounded ${STATUS_COLORS[status] ?? 'bg-surface2 text-muted'}`}>
      {status}
    </span>
  )
}

// ─── Generate Prompt modal ────────────────────────────────────────────────────

interface PromptModalProps {
  prompt: string
  onClose: () => void
}

function PromptModal({ prompt, onClose }: PromptModalProps): React.JSX.Element {
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
          <h2 className="font-serif text-accent text-lg">Generated Prompt</h2>
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

// ─── Log entry row ────────────────────────────────────────────────────────────

interface LogEntryProps {
  entry: ApplicationLog
  applicationId: number
}

function LogEntry({ entry, applicationId }: LogEntryProps): React.JSX.Element {
  const [confirmDelete, setConfirmDelete] = useState(false)
  const deleteLog = useDeleteLog()

  function handleDelete(): void {
    if (!confirmDelete) {
      setConfirmDelete(true)
      return
    }
    deleteLog.mutate({ applicationId, logId: entry.id })
  }

  // Resolve human-readable label for the type_id from the static map (type_id isn't joined here,
  // but the log text itself carries meaning — we show the raw type label from our options map)
  const isPromptEntry = entry.llm_call_log_id !== null

  return (
    <div className="bg-surface2 rounded p-3 space-y-1.5">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[10px] font-mono text-muted uppercase">
            {fmtDate(entry.log_timestamp)}
          </span>
          {isPromptEntry && entry.llm_call_log_id !== null && (
            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-accent/10 text-accent">
              prompt
            </span>
          )}
        </div>
        <button
          onClick={handleDelete}
          disabled={deleteLog.isPending}
          className={`text-xs font-mono shrink-0 transition-colors disabled:opacity-50 ${
            confirmDelete ? 'text-red' : 'text-muted hover:text-red'
          }`}
        >
          {confirmDelete ? 'Confirm?' : '✕'}
        </button>
      </div>
      {entry.log && (
        <p className="text-xs text-text leading-relaxed whitespace-pre-wrap">{entry.log}</p>
      )}
      {entry.url && (
        <a
          href={entry.url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-accent hover:underline"
        >
          {entry.url}
        </a>
      )}
    </div>
  )
}

// ─── Add log form ─────────────────────────────────────────────────────────────

interface AddLogFormProps {
  applicationId: number
}

function AddLogForm({ applicationId }: AddLogFormProps): React.JSX.Element {
  const [typeValue, setTypeValue] = useState('general')
  const [logText, setLogText] = useState('')
  const [url, setUrl] = useState('')
  const addLog = useAddLog()

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault()
    if (!logText.trim()) return
    await addLog.mutateAsync({
      applicationId,
      type_value: typeValue,
      log: logText.trim(),
      url: url.trim() || undefined,
    })
    setLogText('')
    setUrl('')
  }

  return (
    <form onSubmit={(e) => void handleSubmit(e)} className="space-y-2 pt-2">
      <div className="flex items-center gap-2">
        <select
          className="bg-surface2 rounded px-2 py-1.5 text-sm text-text focus:outline-none focus:ring-1 focus:ring-accent"
          value={typeValue}
          onChange={(e) => setTypeValue(e.target.value)}
        >
          {LOG_TYPE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </div>
      <textarea
        className="w-full h-20 bg-surface2 rounded px-3 py-2 text-text text-sm font-mono focus:outline-none focus:ring-1 focus:ring-accent resize-y"
        placeholder="Log entry…"
        value={logText}
        onChange={(e) => setLogText(e.target.value)}
      />
      <input
        type="url"
        className="w-full bg-surface2 rounded px-3 py-1.5 text-text text-sm font-mono focus:outline-none focus:ring-1 focus:ring-accent"
        placeholder="URL (optional)"
        value={url}
        onChange={(e) => setUrl(e.target.value)}
      />
      <div className="flex items-center justify-between">
        {addLog.isError && (
          <p className="text-red text-xs">{addLog.error.message}</p>
        )}
        <button
          type="submit"
          disabled={addLog.isPending || !logText.trim()}
          className="ml-auto text-sm px-3 py-1.5 bg-surface2 text-accent border border-accent/40 rounded hover:bg-accent/10 disabled:opacity-50 transition-colors"
        >
          {addLog.isPending ? 'Adding…' : '+ Add Log'}
        </button>
      </div>
    </form>
  )
}

// ─── Evaluation card (same pattern as JobDetail) ──────────────────────────────

function EvalCard({ evaluation }: { evaluation: Evaluation }): React.JSX.Element {
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
          Archetype: <span className="text-text">{evaluation.archetype}</span>
        </p>
      )}
      {evaluation.recommendation && (
        <p className="text-xs">
          Rec: <span className={`font-mono ${
            evaluation.recommendation === 'Apply'
              ? 'text-green'
              : evaluation.recommendation === 'Skip'
              ? 'text-red'
              : 'text-accent'
          }`}>{evaluation.recommendation}</span>
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
    </div>
  )
}

// ─── Audit row ────────────────────────────────────────────────────────────────

function AuditRow({ entry }: { entry: ApplicationAuditEntry }): React.JSX.Element {
  return (
    <div className="flex items-start gap-3 py-1.5 border-b border-surface2 last:border-0">
      <span className="text-[10px] font-mono text-muted shrink-0 pt-0.5">{fmtDate(entry.timestamp)}</span>
      <span className="text-xs text-text">{entry.event}</span>
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

interface ApplicationDetailProps {
  applicationId: number
}

export default function ApplicationDetail({ applicationId }: ApplicationDetailProps): React.JSX.Element {
  const { data, isLoading, isError } = useApplicationDetail(applicationId)
  const patch = usePatchApplication()
  const generatePrompt = useGeneratePrompt()
  const [promptText, setPromptText] = useState<string | null>(null)
  const [salaryDraft, setSalaryDraft] = useState<string | null>(null)

  if (isLoading) {
    return <div className="p-6 text-muted text-sm">Loading application…</div>
  }
  if (isError || !data) {
    return <div className="p-6 text-red text-sm">Failed to load application.</div>
  }

  const { application, job, logs, audit, evaluations } = data
  const status = application.application_status
  const isDraft = status === 'draft'

  function handleStatusChange(newStatus: string): void {
    patch.mutate({ applicationId, updates: { application_status: newStatus } })
  }

  function handleSalarySave(): void {
    if (salaryDraft === null) return
    patch.mutate({ applicationId, updates: { requested_salary: salaryDraft } })
    setSalaryDraft(null)
  }

  async function handleGeneratePrompt(): Promise<void> {
    const result = await generatePrompt.mutateAsync(applicationId)
    setPromptText(result.prompt)
  }

  // Logs in reverse-chronological order
  const sortedLogs = [...logs].sort(
    (a, b) => new Date(b.log_timestamp).getTime() - new Date(a.log_timestamp).getTime()
  )

  return (
    <div className="p-6 max-w-2xl mx-auto space-y-6">

      {/* ── Section 1: Header ─────────────────────────────────────── */}
      <section>
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1 min-w-0">
            {job && (
              <p className="text-muted text-xs font-mono">{job.company_name}</p>
            )}
            <h2 className="font-serif text-accent text-2xl leading-tight">
              {job?.title ?? `Application #${applicationId}`}
            </h2>
            <div className="flex items-center gap-2 flex-wrap mt-1">
              <StatusBadge status={status} />
              {job?.location && (
                <span className="text-muted text-xs">📍 {job.location}</span>
              )}
              {job?.remote_type && (
                <span className="text-xs font-mono px-1.5 py-0.5 rounded bg-surface2 text-muted">
                  {job.remote_type}
                </span>
              )}
            </div>
          </div>
          {job && (
            <Link
              to={`/jobs/${job.id}`}
              className="text-xs text-muted hover:text-accent px-2 py-1 border border-surface2 rounded transition-colors shrink-0"
            >
              View Job →
            </Link>
          )}
        </div>
      </section>

      {/* ── Section 2: Actions ────────────────────────────────────── */}
      <section className="flex flex-wrap items-center gap-3">
        {isDraft && (
          <button
            onClick={() => handleStatusChange('applied')}
            disabled={patch.isPending}
            className="text-sm px-4 py-2 bg-accent text-bg rounded hover:bg-accent/90 disabled:opacity-50 transition-colors font-medium"
          >
            Mark as Applied
          </button>
        )}
        <button
          onClick={() => void handleGeneratePrompt()}
          disabled={generatePrompt.isPending}
          className="text-sm px-3 py-1.5 bg-surface2 text-accent border border-accent/40 rounded hover:bg-accent/10 disabled:opacity-50 transition-colors"
        >
          {generatePrompt.isPending ? 'Generating…' : 'Generate Prompt'}
        </button>
        {generatePrompt.isError && (
          <p className="text-red text-xs">{generatePrompt.error.message}</p>
        )}
      </section>

      <hr className="border-surface2" />

      {/* ── Section 3: Details ────────────────────────────────────── */}
      <section className="space-y-3">
        <p className="text-muted text-xs font-mono uppercase tracking-widest">Details</p>

        <div className="grid grid-cols-2 gap-4">
          <label className="block">
            <span className="text-muted text-xs font-mono uppercase tracking-widest">Status</span>
            <select
              className="mt-1 w-full bg-surface2 rounded px-3 py-2 text-text text-sm focus:outline-none focus:ring-1 focus:ring-accent"
              value={status}
              onChange={(e) => handleStatusChange(e.target.value)}
              disabled={patch.isPending}
            >
              {STATUSES.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="text-muted text-xs font-mono uppercase tracking-widest">Apply Date</span>
            <input
              type="date"
              className="mt-1 w-full bg-surface2 rounded px-3 py-2 text-text text-sm focus:outline-none focus:ring-1 focus:ring-accent"
              defaultValue={application.apply_date ?? ''}
              onBlur={(e) => {
                const val = e.target.value
                if (val !== (application.apply_date ?? '')) {
                  patch.mutate({ applicationId, updates: { apply_date: val || undefined } })
                }
              }}
            />
          </label>

          <label className="block">
            <span className="text-muted text-xs font-mono uppercase tracking-widest">End Date</span>
            <input
              type="date"
              className="mt-1 w-full bg-surface2 rounded px-3 py-2 text-text text-sm focus:outline-none focus:ring-1 focus:ring-accent"
              defaultValue={application.end_date ?? ''}
              onBlur={(e) => {
                const val = e.target.value
                if (val !== (application.end_date ?? '')) {
                  patch.mutate({ applicationId, updates: { end_date: val || undefined } })
                }
              }}
            />
          </label>

          <label className="block">
            <span className="text-muted text-xs font-mono uppercase tracking-widest">Requested Salary</span>
            <div className="flex items-center gap-1 mt-1">
              <input
                type="text"
                className="w-full bg-surface2 rounded px-3 py-2 text-text text-sm font-mono focus:outline-none focus:ring-1 focus:ring-accent"
                placeholder="e.g. $120k"
                value={salaryDraft ?? (application.requested_salary ?? '')}
                onChange={(e) => setSalaryDraft(e.target.value)}
                onBlur={handleSalarySave}
                onKeyDown={(e) => { if (e.key === 'Enter') handleSalarySave() }}
              />
            </div>
          </label>
        </div>
      </section>

      <hr className="border-surface2" />

      {/* ── Section 4: Logs ───────────────────────────────────────── */}
      <section>
        <Collapsible title={`Logs (${logs.length})`}>
          <AddLogForm applicationId={applicationId} />
          <div className="space-y-2 mt-4">
            {sortedLogs.length === 0 ? (
              <p className="text-muted text-xs py-1">No log entries yet.</p>
            ) : (
              sortedLogs.map((entry) => (
                <LogEntry key={entry.id} entry={entry} applicationId={applicationId} />
              ))
            )}
          </div>
        </Collapsible>
      </section>

      <hr className="border-surface2" />

      {/* ── Section 5: Documents (Phase 1.2 stub) ─────────────────── */}
      <section>
        <Collapsible title="Documents" defaultOpen={false}>
          <p className="text-muted text-xs py-2 italic">
            Document upload and management coming in Phase 1.2.
          </p>
        </Collapsible>
      </section>

      <hr className="border-surface2" />

      {/* ── Section 6: Evaluations ────────────────────────────────── */}
      <section>
        <Collapsible title={`Evaluations (${evaluations.length})`} defaultOpen={false}>
          {evaluations.length === 0 ? (
            <p className="text-muted text-xs py-2">No evaluations for this job yet.</p>
          ) : (
            <div className="space-y-3 mt-2">
              {evaluations.map((ev) => (
                <EvalCard key={ev.id} evaluation={ev} />
              ))}
            </div>
          )}
        </Collapsible>
      </section>

      <hr className="border-surface2" />

      {/* ── Section 7: Audit trail ────────────────────────────────── */}
      <section>
        <Collapsible title={`Audit (${audit.length})`} defaultOpen={false}>
          {audit.length === 0 ? (
            <p className="text-muted text-xs py-2">No audit events.</p>
          ) : (
            <div className="mt-2">
              {[...audit].reverse().map((entry) => (
                <AuditRow key={entry.id} entry={entry} />
              ))}
            </div>
          )}
        </Collapsible>
      </section>

      {/* ── Prompt modal ─────────────────────────────────────────── */}
      {promptText !== null && (
        <PromptModal prompt={promptText} onClose={() => setPromptText(null)} />
      )}
    </div>
  )
}
