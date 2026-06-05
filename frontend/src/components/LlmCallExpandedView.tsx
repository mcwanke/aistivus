import { useState } from 'react'
import type { LlmCallLogEntry } from '@/types/api'

function fmtLatency(ms: number | null): string {
  if (ms == null) return '—'
  return ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${ms}ms`
}

async function copyToClipboard(text: string): Promise<void> {
  await navigator.clipboard.writeText(text)
}

// ─── Metadata section ─────────────────────────────────────────────────────────

export function LlmMetaSection({ entry }: { entry: LlmCallLogEntry }): React.JSX.Element {
  const items: Array<{ label: string; value: string }> = []

  if (entry.prompt_tokens_estimated != null)
    items.push({ label: 'tokens est.', value: String(entry.prompt_tokens_estimated) })
  if (entry.prompt_tokens_actual != null)
    items.push({ label: 'prompt tokens', value: String(entry.prompt_tokens_actual) })
  if (entry.completion_tokens_actual != null)
    items.push({ label: 'completion tokens', value: String(entry.completion_tokens_actual) })
  if (entry.total_tokens_actual != null)
    items.push({ label: 'total tokens', value: String(entry.total_tokens_actual) })
  if (entry.latency_ms != null)
    items.push({ label: 'latency', value: fmtLatency(entry.latency_ms) })
  if (entry.call_time != null)
    items.push({ label: 'call time', value: `${entry.call_time}s` })

  return (
    <div className="px-4 pt-3 pb-2 border-b border-surface2 bg-surface">
      {items.length > 0 && (
        <div className="flex flex-wrap gap-x-6 gap-y-1 mb-2">
          {items.map(({ label, value }) => (
            <span key={label} className="text-[10px] font-mono text-muted">
              <span className="uppercase tracking-wider">{label}</span>
              <span className="text-text ml-1.5">{value}</span>
            </span>
          ))}
        </div>
      )}
      {entry.error_message && (
        <p className="text-[11px] font-mono text-red mt-1">
          <span className="uppercase tracking-wider text-[10px] text-muted mr-1.5">error</span>
          {entry.error_message}
        </p>
      )}
    </div>
  )
}

// ─── Expanded row ─────────────────────────────────────────────────────────────

export function LlmExpandedRow({ entry }: { entry: LlmCallLogEntry }): React.JSX.Element {
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
    <>
      <LlmMetaSection entry={entry} />

      <div className="px-4 pb-4 space-y-4 bg-surface border-b border-surface2">
        {/* Prompt */}
        <div>
          <div className="flex items-center justify-between mb-1.5 mt-3">
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
    </>
  )
}
