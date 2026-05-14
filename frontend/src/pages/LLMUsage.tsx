import { useState } from 'react'
import type { LlmCallLogEntry } from '@/types/api'
import { useLlmCallLog } from '@/hooks/useLLMUsage'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtDate(ts: string): string {
  return ts.slice(0, 16).replace('T', ' ')
}

function fmtTokens(entry: LlmCallLogEntry): string {
  const total = entry.total_tokens_actual
  if (total == null) return '—'
  const prompt = entry.prompt_tokens_actual ?? '?'
  const completion = entry.completion_tokens_actual ?? '?'
  return `${total} (${prompt}p + ${completion}c)`
}

function fmtLatency(ms: number | null): string {
  if (ms == null) return '—'
  return ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${ms}ms`
}

async function copyToClipboard(text: string): Promise<void> {
  await navigator.clipboard.writeText(text)
}

// ─── Expanded row ─────────────────────────────────────────────────────────────

function ExpandedRow({ entry }: { entry: LlmCallLogEntry }): React.JSX.Element {
  const [promptCopied, setPromptCopied] = useState(false)
  const [showFullPrompt, setShowFullPrompt] = useState(false)
  const [showFullResponse, setShowFullResponse] = useState(false)

  const TRUNCATE_LEN = 600

  const prompt = entry.prompt ?? ''
  const response = entry.raw_response ?? ''

  async function handleCopyPrompt(): Promise<void> {
    if (!prompt) return
    await copyToClipboard(prompt)
    setPromptCopied(true)
    setTimeout(() => setPromptCopied(false), 2000)
  }

  return (
    <div className="px-4 pb-4 space-y-4 bg-surface border-b border-surface2">
      {/* Prompt */}
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <p className="text-[10px] font-mono text-muted uppercase tracking-wider">Prompt</p>
          <div className="flex items-center gap-2">
            {prompt && (
              <button
                onClick={() => void handleCopyPrompt()}
                className={`text-xs font-mono px-2 py-0.5 rounded border transition-colors ${
                  promptCopied
                    ? 'border-green/40 text-green bg-green/5'
                    : 'border-surface2 text-muted hover:text-accent hover:border-accent/40'
                }`}
              >
                {promptCopied ? 'Copied!' : 'Copy prompt'}
              </button>
            )}
            {prompt.length > TRUNCATE_LEN && (
              <button
                onClick={() => setShowFullPrompt((v) => !v)}
                className="text-xs font-mono text-muted hover:text-text transition-colors"
              >
                {showFullPrompt ? 'Show less' : 'Show more'}
              </button>
            )}
          </div>
        </div>
        {prompt ? (
          <pre className="text-xs font-mono text-muted/80 whitespace-pre-wrap bg-surface2 rounded p-3 max-h-64 overflow-y-auto">
            {showFullPrompt ? prompt : prompt.slice(0, TRUNCATE_LEN) + (prompt.length > TRUNCATE_LEN ? '…' : '')}
          </pre>
        ) : (
          <p className="text-xs font-mono text-muted/50">No prompt stored.</p>
        )}
      </div>

      {/* Raw response */}
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <p className="text-[10px] font-mono text-muted uppercase tracking-wider">Raw response</p>
          {response.length > TRUNCATE_LEN && (
            <button
              onClick={() => setShowFullResponse((v) => !v)}
              className="text-xs font-mono text-muted hover:text-text transition-colors"
            >
              {showFullResponse ? 'Show less' : 'Show more'}
            </button>
          )}
        </div>
        {response ? (
          <pre className="text-xs font-mono text-muted/80 whitespace-pre-wrap bg-surface2 rounded p-3 max-h-48 overflow-y-auto">
            {showFullResponse
              ? response
              : response.slice(0, TRUNCATE_LEN) + (response.length > TRUNCATE_LEN ? '…' : '')}
          </pre>
        ) : (
          <p className="text-xs font-mono text-muted/50">No response stored.</p>
        )}
      </div>

      {/* Metadata */}
      {entry.prompt_hash && (
        <p className="text-[10px] font-mono text-muted/50">
          prompt_hash: {entry.prompt_hash}
        </p>
      )}
    </div>
  )
}

// ─── Log row ──────────────────────────────────────────────────────────────────

function LogRow({ entry }: { entry: LlmCallLogEntry }): React.JSX.Element {
  const [expanded, setExpanded] = useState(false)
  const [promptCopied, setPromptCopied] = useState(false)

  async function handleCopyPrompt(e: React.MouseEvent): Promise<void> {
    e.stopPropagation()
    if (!entry.prompt) return
    await copyToClipboard(entry.prompt)
    setPromptCopied(true)
    setTimeout(() => setPromptCopied(false), 2000)
  }

  return (
    <>
      <div
        onClick={() => setExpanded((v) => !v)}
        className="grid grid-cols-[1fr_6rem_6rem_5rem_5rem_6rem_6rem] gap-2 items-center px-4 py-2.5 border-b border-surface2 cursor-pointer hover:bg-surface transition-colors"
      >
        <p className="font-mono text-xs text-text truncate">
          {fmtDate(entry.timestamp)}
          {entry.job_id != null && (
            <span className="text-muted ml-2">job #{entry.job_id}</span>
          )}
        </p>
        <p className="font-mono text-xs text-muted truncate">
          {entry.call_type ?? '—'}
        </p>
        <p className="font-mono text-xs text-muted truncate">
          model #{entry.llm_model_id ?? '—'}
        </p>
        <span
          className={`text-[10px] font-mono px-1.5 py-0.5 rounded border w-fit ${
            entry.success === 1
              ? 'bg-green/10 text-green border-green/30'
              : 'bg-red/10 text-red border-red/30'
          }`}
        >
          {entry.success === 1 ? 'ok' : 'fail'}
        </span>
        <p className="font-mono text-xs text-muted">{fmtLatency(entry.latency_ms)}</p>
        <p className="font-mono text-xs text-muted truncate">{fmtTokens(entry)}</p>
        <div className="flex justify-end">
          <button
            onClick={(e) => void handleCopyPrompt(e)}
            className={`text-xs font-mono px-2 py-0.5 rounded border transition-colors ${
              promptCopied
                ? 'border-green/40 text-green bg-green/5'
                : 'border-surface2 text-muted hover:text-accent hover:border-accent/40'
            }`}
          >
            {promptCopied ? 'Copied!' : 'Copy'}
          </button>
        </div>
      </div>
      {expanded && <ExpandedRow entry={entry} />}
    </>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

const CALL_TYPES = ['', 'evaluation', 'generation', 'chat']
const LIMITS = [25, 50, 100, 250, 500]

export default function LLMUsage(): React.JSX.Element {
  const [callType, setCallType] = useState('')
  const [jobIdStr, setJobIdStr] = useState('')
  const [limit, setLimit] = useState(100)

  const jobId = jobIdStr.trim() ? parseInt(jobIdStr, 10) : null
  const { data: entries = [], isLoading, error, refetch } = useLlmCallLog({
    call_type: callType || null,
    job_id: jobId,
    limit,
  })

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header + filters */}
      <div className="px-6 py-4 border-b border-surface2 flex items-center gap-4 flex-wrap shrink-0">
        <h1 className="font-serif text-accent text-xl mr-2">LLM Usage</h1>

        <div className="flex items-center gap-1">
          <label className="text-[10px] font-mono text-muted uppercase tracking-wider mr-1">
            Type
          </label>
          <select
            value={callType}
            onChange={(e) => setCallType(e.target.value)}
            className="bg-surface border border-surface2 rounded px-2 py-1 text-xs font-mono text-text focus:outline-none focus:border-accent/50"
          >
            {CALL_TYPES.map((t) => (
              <option key={t} value={t}>{t || 'all'}</option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-1">
          <label className="text-[10px] font-mono text-muted uppercase tracking-wider mr-1">
            Job ID
          </label>
          <input
            type="number"
            value={jobIdStr}
            onChange={(e) => setJobIdStr(e.target.value)}
            placeholder="any"
            className="bg-surface border border-surface2 rounded px-2 py-1 text-xs font-mono text-text focus:outline-none focus:border-accent/50 w-20"
          />
        </div>

        <div className="flex items-center gap-1">
          <label className="text-[10px] font-mono text-muted uppercase tracking-wider mr-1">
            Limit
          </label>
          <select
            value={limit}
            onChange={(e) => setLimit(parseInt(e.target.value, 10))}
            className="bg-surface border border-surface2 rounded px-2 py-1 text-xs font-mono text-text focus:outline-none focus:border-accent/50"
          >
            {LIMITS.map((l) => (
              <option key={l} value={l}>{l}</option>
            ))}
          </select>
        </div>

        <button
          onClick={() => void refetch()}
          className="text-xs font-mono text-muted border border-surface2 px-2 py-1 rounded hover:text-text hover:border-accent/40 transition-colors"
        >
          Refresh
        </button>

        <span className="text-xs font-mono text-muted ml-auto">
          {isLoading ? 'Loading…' : `${entries.length} entries`}
        </span>
      </div>

      {/* Table header */}
      <div className="grid grid-cols-[1fr_6rem_6rem_5rem_5rem_6rem_6rem] gap-2 px-4 py-2 border-b border-surface2 shrink-0">
        {['Timestamp / Job', 'Type', 'Model', 'Status', 'Latency', 'Tokens', 'Prompt'].map((h) => (
          <p key={h} className="text-[10px] font-mono text-muted uppercase tracking-wider">{h}</p>
        ))}
      </div>

      {/* Rows */}
      <div className="flex-1 overflow-y-auto">
        {error && (
          <div className="p-6">
            <p className="text-sm text-red">{(error as Error).message}</p>
          </div>
        )}
        {!isLoading && !error && entries.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full gap-2">
            <p className="text-sm text-muted">No LLM calls recorded yet.</p>
          </div>
        )}
        {entries.map((entry) => (
          <LogRow key={entry.id} entry={entry} />
        ))}
      </div>
    </div>
  )
}
