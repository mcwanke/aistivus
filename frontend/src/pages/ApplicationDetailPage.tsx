import { useState, useMemo, useRef, useLayoutEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import {
  useApplicationDetail,
  usePatchApplication,
  useAddLog,
  useDeleteLog,
  useGeneratePrompt,
  usePatchLogTimestamp,
  usePatchAuditTimestamp,
  useAppSettings,
} from '@/hooks/useApplications'
import { useLessonChat } from '@/hooks/useLessonChat'
import type { LessonChatFinalizeResponse } from '@/types/profile'
import type { ApplicationStatus } from '@/types/api'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return '—'
  return iso.replace('T', ' ').slice(0, 16)
}

function toDatetimeLocal(iso: string): string {
  return iso.replace(' ', 'T').slice(0, 16)
}

function fromDatetimeLocal(val: string): string {
  return val.replace('T', ' ') + ':00'
}

function formatTypeValue(tv: string): string {
  return tv.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

// ─── Status constants ─────────────────────────────────────────────────────────

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

const LOG_TYPE_OPTIONS = [
  { value: 'recruiter_call',     label: 'Recruiter Call' },
  { value: 'interview_feedback', label: 'Interview Feedback' },
  { value: 'compensation',       label: 'Compensation' },
  { value: 'repost_alert',       label: 'Repost Alert' },
  { value: 'general',            label: 'General' },
]

// ─── Merged log item shape ────────────────────────────────────────────────────

interface MergedLogItem {
  key: string
  kind: 'audit' | 'log' | 'job-added' | 'job-desc'
  timestamp: string
  activityType: string
  source: string
  text: string | null
  url: string | null
  rawId: number | null
  canEditTimestamp: boolean
  canDelete: boolean
}

// ─── Prompt modal ─────────────────────────────────────────────────────────────

function PromptModal({ prompt, onClose }: { prompt: string; onClose: () => void }): React.JSX.Element {
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

// ─── Timestamp edit modal ─────────────────────────────────────────────────────

interface TsModalProps {
  current: string
  onSave: (ts: string) => void
  onClose: () => void
}

function TimestampModal({ current, onSave, onClose }: TsModalProps): React.JSX.Element {
  const [value, setValue] = useState(toDatetimeLocal(current))

  return (
    <div className="fixed inset-0 bg-bg/80 flex items-center justify-center z-50 p-4">
      <div className="bg-surface border border-surface2 rounded p-6 w-full max-w-sm flex flex-col gap-4">
        <p className="text-xs font-mono text-muted uppercase tracking-widest">Edit Timestamp</p>
        <input
          type="datetime-local"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className="w-full bg-surface2 rounded px-3 py-2 text-text text-sm font-mono focus:outline-none focus:ring-1 focus:ring-accent"
        />
        <div className="flex gap-2 justify-end">
          <button
            onClick={onClose}
            className="text-xs px-3 py-1.5 text-muted hover:text-text transition-colors font-mono"
          >
            Cancel
          </button>
          <button
            onClick={() => { if (value) onSave(fromDatetimeLocal(value)) }}
            disabled={!value}
            className="text-xs px-3 py-1.5 bg-accent text-bg rounded hover:bg-accent/90 disabled:opacity-50 transition-colors font-mono"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Log row ──────────────────────────────────────────────────────────────────

interface LogRowProps {
  item: MergedLogItem
  applicationId: number
  onEditTimestamp: (item: MergedLogItem) => void
}

function LogRow({ item, applicationId, onEditTimestamp }: LogRowProps): React.JSX.Element {
  const [expanded, setExpanded] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [copied, setCopied] = useState(false)
  const deleteLog = useDeleteLog()

  function handleDelete(): void {
    if (!confirmDelete) { setConfirmDelete(true); return }
    if (item.rawId !== null) {
      deleteLog.mutate({ applicationId, logId: item.rawId })
    }
  }

  function handleCopy(): void {
    void navigator.clipboard.writeText(item.text ?? '').then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  }

  return (
    <div className="border border-surface2 rounded bg-surface">

      {/* ── Collapsed header row ─────────────────────────────── */}
      <div
        className="flex items-center gap-2 px-3 py-2 cursor-pointer select-none"
        onClick={() => { setExpanded((e) => !e); setConfirmDelete(false) }}
      >

        {/* Timestamp */}
        <span
          onClick={(e) => {
            if (item.canEditTimestamp) {
              e.stopPropagation()
              onEditTimestamp(item)
            }
          }}
          className={`text-[10px] font-mono shrink-0 w-32 ${
            item.canEditTimestamp
              ? 'text-muted cursor-pointer hover:text-accent underline decoration-dotted'
              : 'text-muted'
          }`}
        >
          {fmtDateTime(item.timestamp)}
        </span>

        {/* Activity type */}
        <span className="text-[10px] font-mono text-muted uppercase tracking-wider shrink-0 w-36 truncate">
          {item.activityType}
        </span>

        {/* Source — flex-1 so long labels don't truncate */}
        <span className="text-[10px] font-mono text-muted flex-1 min-w-0">
          {item.source}
        </span>

        {/* Actions — pushed right, stopPropagation so they don't toggle the row */}
        <div
          className="flex items-center gap-1.5 shrink-0"
          onClick={(e) => e.stopPropagation()}
        >
          <button
            onClick={handleCopy}
            className="text-[10px] font-mono px-1.5 py-0.5 border border-surface2 rounded text-muted hover:text-accent hover:border-accent transition-colors"
          >
            {copied ? 'Copied' : 'Copy'}
          </button>

          {item.canDelete && (
            <button
              onClick={handleDelete}
              disabled={deleteLog.isPending}
              className={`text-[10px] font-mono px-1.5 py-0.5 border rounded transition-colors disabled:opacity-50 ${
                confirmDelete
                  ? 'border-red text-red'
                  : 'border-surface2 text-muted hover:text-red hover:border-red'
              }`}
            >
              {confirmDelete ? 'Confirm?' : 'Delete'}
            </button>
          )}
        </div>

        {/* Arrow — outside stopPropagation div so row click still works */}
        <span className="text-[10px] font-mono px-1.5 py-0.5 text-muted shrink-0">
          {expanded ? '▲' : '▼'}
        </span>
      </div>

      {/* ── Expanded content ─────────────────────────────────── */}
      {expanded && (
        <div className="px-3 pb-3 border-t border-surface2 pt-2 space-y-1">
          {item.text ? (
            <p className="text-xs text-text leading-relaxed whitespace-pre-wrap font-mono">
              {item.text}
            </p>
          ) : (
            <p className="text-xs text-muted italic">No content.</p>
          )}
          {item.url && (
            <a
              href={item.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-accent hover:underline break-all block mt-1"
            >
              {item.url}
            </a>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Lesson capture panel ─────────────────────────────────────────────────────

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

      {/* Success banner */}
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

      {/* Chat thread */}
      <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
        {/* Static opener from assistant */}
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

      {/* Finalize result card */}
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

      {/* Input */}
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

// ─── Application detail panel (left column) ───────────────────────────────────

interface DetailPanelProps {
  applicationId: number
}

function ApplicationDetailPanel({ applicationId }: DetailPanelProps): React.JSX.Element {
  const { data, isLoading, isError } = useApplicationDetail(applicationId)
  const patch = usePatchApplication()
  const addLog = useAddLog()
  const generatePrompt = useGeneratePrompt()
  const [leftTab, setLeftTab] = useState<'details' | 'add-log' | 'add-lesson'>('details')
  const [promptText, setPromptText] = useState<string | null>(null)
  const [salaryDraft, setSalaryDraft] = useState<string | null>(null)
  const [logType, setLogType] = useState('general')
  const [logText, setLogText] = useState('')
  const [logUrl, setLogUrl] = useState('')
  const qc = useQueryClient()

  if (isLoading) return <div className="p-6 text-muted text-sm font-mono">Loading…</div>
  if (isError || !data) return <div className="p-6 text-red text-sm font-mono">Failed to load.</div>

  const { application, job } = data
  const status = application.application_status
  const isApplied = application.applied === 1

  function handleStatusChange(s: string): void {
    patch.mutate({ applicationId, updates: { application_status: s } })
  }

  function handleMarkApplied(): void {
    patch.mutate({ applicationId, updates: { applied: 1, application_status: 'applied' } })
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

  async function handleAddLog(e: React.FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault()
    if (!logText.trim()) return
    await addLog.mutateAsync({
      applicationId,
      type_value: logType,
      log: logText.trim(),
      url: logUrl.trim() || undefined,
    })
    setLogText('')
    setLogUrl('')
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="p-5 space-y-5">

        {/* ── Header ──────────────────────────────────────────── */}
        <section className="space-y-1">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              {job && (
                <p className="text-muted text-xs font-mono">{job.company_name}</p>
              )}
              <h2 className="font-serif text-accent text-xl leading-tight">
                {job?.title ?? `Application #${applicationId}`}
              </h2>
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
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`text-xs font-mono px-2 py-0.5 rounded ${STATUS_COLORS[status] ?? 'bg-surface2 text-muted'}`}>
              {status}
            </span>
            {job?.location && (
              <span className="text-muted text-xs">📍 {job.location}</span>
            )}
            {job?.remote_type && (
              <span className="text-xs font-mono px-1.5 py-0.5 rounded bg-surface2 text-muted">
                {job.remote_type}
              </span>
            )}
          </div>
        </section>

        <hr className="border-surface2" />

        {/* ── Actions ─────────────────────────────────────────── */}
        <section className="space-y-2">
          <p className="text-muted text-[10px] font-mono uppercase tracking-widest">Actions</p>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={handleMarkApplied}
              disabled={patch.isPending || isApplied}
              className={`text-sm px-4 py-2 rounded font-medium transition-colors disabled:opacity-60 ${
                isApplied
                  ? 'bg-green/20 text-green cursor-default'
                  : 'bg-accent text-bg hover:bg-accent/90'
              }`}
            >
              {isApplied ? 'Applied ✓' : 'Mark as Applied'}
            </button>
            <button
              onClick={() => void handleGeneratePrompt()}
              disabled={generatePrompt.isPending}
              className="text-sm px-3 py-2 bg-surface2 text-accent border border-accent/40 rounded hover:bg-accent/10 disabled:opacity-50 transition-colors"
            >
              {generatePrompt.isPending ? 'Generating…' : 'Generate Prompt'}
            </button>
          </div>
          {generatePrompt.isError && (
            <p className="text-red text-xs">{generatePrompt.error.message}</p>
          )}
        </section>

        <hr className="border-surface2" />

        {/* ── Tabs: Details / Add Log / Add Lesson ─────────────── */}
        <div>
          <div className="flex gap-0 border-b border-surface2 mb-4">
            {(['details', 'add-log', 'add-lesson'] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setLeftTab(tab)}
                className={`px-3 py-1.5 text-xs font-mono border-b-2 transition-colors ${
                  leftTab === tab
                    ? 'border-accent text-accent -mb-px'
                    : 'border-transparent text-muted hover:text-text'
                }`}
              >
                {tab === 'details' ? 'Details' : tab === 'add-log' ? 'Add Log' : 'Add Lesson'}
              </button>
            ))}
          </div>

          {leftTab === 'details' && (
            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="text-muted text-[10px] font-mono uppercase tracking-widest">Status</span>
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
                <span className="text-muted text-[10px] font-mono uppercase tracking-widest">Apply Date</span>
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
                <span className="text-muted text-[10px] font-mono uppercase tracking-widest">End Date</span>
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
                <span className="text-muted text-[10px] font-mono uppercase tracking-widest">Requested Salary</span>
                <input
                  type="text"
                  className="mt-1 w-full bg-surface2 rounded px-3 py-2 text-text text-sm font-mono focus:outline-none focus:ring-1 focus:ring-accent"
                  placeholder="e.g. $120k"
                  value={salaryDraft ?? (application.requested_salary ?? '')}
                  onChange={(e) => setSalaryDraft(e.target.value)}
                  onBlur={handleSalarySave}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleSalarySave() }}
                />
              </label>
            </div>
          )}

          {leftTab === 'add-log' && (
            <form onSubmit={(e) => void handleAddLog(e)} className="space-y-2">
              <select
                className="w-full bg-surface2 rounded px-3 py-2 text-text text-sm focus:outline-none focus:ring-1 focus:ring-accent"
                value={logType}
                onChange={(e) => setLogType(e.target.value)}
              >
                {LOG_TYPE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
              <textarea
                className="w-full h-20 bg-surface2 rounded px-3 py-2 text-text text-sm font-mono focus:outline-none focus:ring-1 focus:ring-accent resize-y"
                placeholder="Log entry…"
                value={logText}
                onChange={(e) => setLogText(e.target.value)}
              />
              <input
                type="url"
                className="w-full bg-surface2 rounded px-3 py-2 text-text text-sm font-mono focus:outline-none focus:ring-1 focus:ring-accent"
                placeholder="URL (optional)"
                value={logUrl}
                onChange={(e) => setLogUrl(e.target.value)}
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
          )}

          {leftTab === 'add-lesson' && (
            <LessonCapturePanel
              applicationId={applicationId}
              jobTitle={job?.title}
              companyName={job?.company_name}
              onFinalized={() => void qc.invalidateQueries({ queryKey: ['application', applicationId] })}
            />
          )}
        </div>
      </div>

      {promptText !== null && (
        <PromptModal prompt={promptText} onClose={() => setPromptText(null)} />
      )}
    </div>
  )
}

// ─── Application log panel (right column) ─────────────────────────────────────

interface LogPanelProps {
  applicationId: number
}

function ApplicationLogPanel({ applicationId }: LogPanelProps): React.JSX.Element {
  const { data, isLoading, isError } = useApplicationDetail(applicationId)
  const { data: settings } = useAppSettings()
  const patchLogTs = usePatchLogTimestamp()
  const patchAuditTs = usePatchAuditTimestamp()
  const [tsEditTarget, setTsEditTarget] = useState<MergedLogItem | null>(null)

  const allowAuditTsEdit =
    settings?.find((s) => s.key === 'allow_audit_timestamp_edit')?.value === '1'

  const items = useMemo<MergedLogItem[]>(() => {
    if (!data) return []
    const { logs, audit, job } = data

    const logItems: MergedLogItem[] = logs.map((l) => {
      const isPrompt = l.type_value === 'prompt'
      return {
        key: `log-${l.id}`,
        kind: 'log',
        timestamp: l.log_timestamp,
        activityType: isPrompt
          ? 'AI PROMPT'
          : l.type_value.replace(/_/g, ' ').toUpperCase(),
        source: isPrompt
          ? (l.llm_call_log_id !== null ? 'Local Evaluation' : 'External Evaluation + Resume Gen')
          : `User / ${formatTypeValue(l.type_value)}`,
        text: l.log,
        url: l.url,
        rawId: l.id,
        canEditTimestamp: true,
        canDelete: true,
      }
    })

    const auditItems: MergedLogItem[] = audit.map((a) => ({
      key: `audit-${a.id}`,
      kind: 'audit',
      timestamp: a.timestamp,
      activityType: 'SYSTEM',
      source: a.event,
      text: a.event,
      url: null,
      rawId: a.id,
      canEditTimestamp: allowAuditTsEdit,
      canDelete: false,
    }))

    const syntheticItems: MergedLogItem[] = []

    if (job) {
      syntheticItems.push({
        key: 'job-added',
        kind: 'job-added',
        timestamp: job.created_at,
        activityType: 'JOB',
        source: 'Job Created',
        text: `${job.company_name} — ${job.title}`,
        url: null,
        rawId: null,
        canEditTimestamp: false,
        canDelete: false,
      })

      if (job.description_merged) {
        syntheticItems.push({
          key: 'job-desc',
          kind: 'job-desc',
          timestamp: job.created_at,
          activityType: 'JOB',
          source: 'Job Description',
          text: job.description_merged,
          url: null,
          rawId: null,
          canEditTimestamp: false,
          canDelete: false,
        })
      }
    }

    return [...logItems, ...auditItems, ...syntheticItems].sort(
      (a, b) =>
        new Date(b.timestamp.replace(' ', 'T')).getTime() -
        new Date(a.timestamp.replace(' ', 'T')).getTime(),
    )
  }, [data, allowAuditTsEdit])

  function handleEditTimestamp(item: MergedLogItem): void {
    setTsEditTarget(item)
  }

  function handleSaveTimestamp(ts: string): void {
    if (!tsEditTarget) return
    if (tsEditTarget.kind === 'log' && tsEditTarget.rawId !== null) {
      patchLogTs.mutate({ applicationId, logId: tsEditTarget.rawId, timestamp: ts })
    } else if (tsEditTarget.kind === 'audit' && tsEditTarget.rawId !== null) {
      patchAuditTs.mutate({ applicationId, auditId: tsEditTarget.rawId, timestamp: ts })
    }
    setTsEditTarget(null)
  }

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center text-muted text-sm font-mono">
        Loading log…
      </div>
    )
  }
  if (isError || !data) {
    return (
      <div className="h-full flex items-center justify-center text-red text-sm font-mono">
        Failed to load log.
      </div>
    )
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="px-5 py-4 border-b border-surface2">
        <h2 className="font-serif text-accent text-xl">Application Log</h2>
        <p className="text-muted text-xs font-mono mt-0.5">{items.length} entries</p>
      </div>

      <div className="p-5 space-y-2">
        {items.length === 0 ? (
          <p className="text-muted text-sm text-center py-8">No log entries yet.</p>
        ) : (
          items.map((item) => (
            <LogRow
              key={item.key}
              item={item}
              applicationId={applicationId}
              onEditTimestamp={handleEditTimestamp}
            />
          ))
        )}
      </div>

      {tsEditTarget && (
        <TimestampModal
          current={tsEditTarget.timestamp}
          onSave={handleSaveTimestamp}
          onClose={() => setTsEditTarget(null)}
        />
      )}
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ApplicationDetailPage(): React.JSX.Element {
  const { applicationId: appIdParam } = useParams<{ applicationId: string }>()
  const applicationId = parseInt(appIdParam ?? '0', 10)

  if (!applicationId) {
    return (
      <div className="flex items-center justify-center h-full text-muted text-sm">
        Invalid application ID.
      </div>
    )
  }

  return (
    <div className="flex h-full overflow-hidden">
      {/* ── Left: detail + actions ──────────────────────────── */}
      <div className="w-[420px] shrink-0 border-r border-surface2 flex flex-col overflow-hidden">
        <div className="px-5 py-3 border-b border-surface2 flex items-center gap-3">
          <Link
            to="/applications"
            className="text-xs font-mono text-muted hover:text-accent transition-colors"
          >
            ← Applications
          </Link>
          <h1 className="font-serif text-accent text-xl">Application Detail</h1>
        </div>
        <div className="flex-1 overflow-hidden">
          <ApplicationDetailPanel applicationId={applicationId} />
        </div>
      </div>

      {/* ── Right: full activity log ────────────────────────── */}
      <div className="flex-1 overflow-hidden">
        <ApplicationLogPanel applicationId={applicationId} />
      </div>
    </div>
  )
}
