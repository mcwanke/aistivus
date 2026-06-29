import { useState } from 'react'
import { useJobResearch, useImportResearch, useGenerateResearchPrompt } from '@/hooks/useJobs'
import type { JobResearch } from '@/types/api'

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
          <h2 className="font-serif text-accent text-lg">Company Research Prompt</h2>
          <div className="flex items-center gap-2">
            <button
              onClick={handleCopy}
              className="text-xs px-3 py-1.5 bg-accent text-bg rounded hover:bg-accent/90 transition-colors font-mono"
            >
              {copied ? 'Copied!' : 'Copy'}
            </button>
            <button onClick={onClose} className="text-xs px-3 py-1.5 text-muted hover:text-text transition-colors">
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

// ─── Import modal ─────────────────────────────────────────────────────────────

function ImportModal({
  jobId,
  onClose,
  onSuccess,
}: {
  jobId: number
  onClose: () => void
  onSuccess: () => void
}): React.JSX.Element {
  const [text, setText] = useState('')
  const importMutation = useImportResearch(jobId)

  async function handleImport(): Promise<void> {
    await importMutation.mutateAsync(text.trim())
    onSuccess()
    onClose()
  }

  return (
    <div className="fixed inset-0 bg-bg/80 flex items-center justify-center z-50 p-4">
      <div className="bg-surface rounded p-6 w-full max-w-2xl flex flex-col gap-4 max-h-[80vh]">
        <h2 className="font-serif text-accent text-lg">Import Research Results</h2>
        <p className="text-xs font-mono text-muted">Paste the JSON output from the research prompt below.</p>
        <textarea
          className="flex-1 min-h-[300px] bg-surface2 rounded px-3 py-2 text-xs font-mono text-text focus:outline-none focus:ring-1 focus:ring-accent resize-y"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder='{ "research_summary": "...", "research_confidence": "high", ... }'
        />
        {importMutation.isError && (
          <p className="text-red text-xs font-mono">{importMutation.error.message}</p>
        )}
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-1.5 text-sm text-muted hover:text-text transition-colors">
            Cancel
          </button>
          <button
            onClick={() => void handleImport()}
            disabled={!text.trim() || importMutation.isPending}
            className="px-4 py-1.5 text-sm bg-accent text-bg rounded hover:bg-accent/90 disabled:opacity-50 transition-colors"
          >
            {importMutation.isPending ? 'Importing…' : 'Parse & Import'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Confidence badge ─────────────────────────────────────────────────────────

function ConfidenceBadge({ level }: { level: string }): React.JSX.Element {
  const colors: Record<string, string> = {
    high: 'text-green border-green/40',
    medium: 'text-accent border-accent/40',
    low: 'text-red border-red/40',
  }
  const cls = colors[level] ?? 'text-muted border-surface2'
  return (
    <span className={`text-[10px] font-mono uppercase tracking-widest border rounded px-1.5 py-0.5 ${cls}`}>
      {level}
    </span>
  )
}

// ─── JSON list display ────────────────────────────────────────────────────────

function JsonList({ raw }: { raw: string | null }): React.JSX.Element {
  if (!raw) return <span className="text-xs text-muted">—</span>
  try {
    const parsed: unknown = JSON.parse(raw)
    if (Array.isArray(parsed)) {
      return (
        <ul className="space-y-1 mt-1">
          {(parsed as unknown[]).map((item, i) => (
            <li key={i} className="text-xs text-text font-mono">• {String(item)}</li>
          ))}
        </ul>
      )
    }
    if (typeof parsed === 'object' && parsed !== null) {
      return (
        <pre className="text-xs font-mono text-text whitespace-pre-wrap mt-1">
          {JSON.stringify(parsed, null, 2)}
        </pre>
      )
    }
  } catch {
    // fall through
  }
  return <span className="text-xs text-text">{raw}</span>
}

// ─── Research display ─────────────────────────────────────────────────────────

function ResearchDisplay({ research }: { research: JobResearch }): React.JSX.Element {
  const ts = new Date(research.imported_at).toLocaleDateString(undefined, {
    year: 'numeric', month: 'short', day: 'numeric',
  })

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="flex flex-col gap-0.5">
          <span className="text-[10px] font-mono text-muted uppercase tracking-widest">Research Confidence</span>
          <ConfidenceBadge level={research.research_confidence} />
        </div>
        <div className="flex flex-col gap-0.5 ml-6">
          <span className="text-[10px] font-mono text-muted uppercase tracking-widest">Last Researched</span>
          <span className="text-xs font-mono text-text">{ts}</span>
        </div>
      </div>

      <hr className="border-surface2" />

      {/* Summary */}
      {research.research_summary && (
        <div>
          <p className="text-[10px] font-mono text-muted uppercase tracking-widest mb-1">Summary</p>
          <p className="text-sm text-text leading-relaxed">{research.research_summary}</p>
        </div>
      )}

      {/* Company */}
      <div>
        <p className="text-[10px] font-mono text-muted uppercase tracking-widest mb-2">Company</p>
        <div className="space-y-1.5">
          {(
            [
              ['Overview', research.company_overview],
              ['Stage', research.company_stage],
              ['Size', research.company_size_actual],
              ['Trajectory', research.company_trajectory],
            ] as [string, string | null][]
          ).map(([label, val]) => (
            <div key={label} className="flex items-baseline gap-2">
              <span className="text-[10px] font-mono text-muted uppercase w-20 shrink-0">{label}</span>
              <span className="text-xs text-text">{val ?? '—'}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Culture */}
      {research.company_culture_overview && (
        <div>
          <p className="text-[10px] font-mono text-muted uppercase tracking-widest mb-1">Culture</p>
          <p className="text-sm text-text leading-relaxed">{research.company_culture_overview}</p>
          {research.culture_signals && (
            <div className="mt-2">
              <JsonList raw={research.culture_signals} />
            </div>
          )}
        </div>
      )}

      {/* Compensation */}
      {research.comp_signals && (
        <div>
          <p className="text-[10px] font-mono text-muted uppercase tracking-widest mb-1">Compensation</p>
          <JsonList raw={research.comp_signals} />
        </div>
      )}

      {/* Role context */}
      {research.role_context && (
        <div>
          <p className="text-[10px] font-mono text-muted uppercase tracking-widest mb-1">Role Context</p>
          <JsonList raw={research.role_context} />
        </div>
      )}

      {/* Interview process */}
      {research.interview_process && (
        <div>
          <p className="text-[10px] font-mono text-muted uppercase tracking-widest mb-1">Interview Process</p>
          <p className="text-sm text-text leading-relaxed">{research.interview_process}</p>
        </div>
      )}

      {/* Flags */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <p className="text-[10px] font-mono text-muted uppercase tracking-widest mb-1">Green Flags</p>
          <JsonList raw={research.green_flags} />
        </div>
        <div>
          <p className="text-[10px] font-mono text-muted uppercase tracking-widest mb-1">Red Flags</p>
          <JsonList raw={research.red_flags} />
        </div>
      </div>
    </div>
  )
}

// ─── ResearchSubpage ──────────────────────────────────────────────────────────

interface ResearchSubpageProps {
  jobId: number
}

export function ResearchSubpage({ jobId }: ResearchSubpageProps): React.JSX.Element {
  const [showImport, setShowImport] = useState(false)
  const [promptText, setPromptText] = useState<string | null>(null)
  const { data: research, isLoading, isError, refetch } = useJobResearch(jobId)
  const generatePrompt = useGenerateResearchPrompt(jobId)

  async function handleGenerate(): Promise<void> {
    const result = await generatePrompt.mutateAsync()
    setPromptText(result.prompt)
  }

  if (isLoading) {
    return <p className="text-xs font-mono text-muted">Loading research…</p>
  }
  if (isError) {
    return <p className="text-xs font-mono text-red">Failed to load research data.</p>
  }

  return (
    <div className="space-y-5">
      {/* Action bar */}
      <div className="flex gap-2 flex-wrap">
        <button
          onClick={() => void handleGenerate()}
          disabled={generatePrompt.isPending}
          className="px-3 py-1.5 text-xs font-mono text-muted border border-surface2 rounded hover:text-text hover:border-accent/40 transition-colors disabled:opacity-50"
        >
          {generatePrompt.isPending ? 'Generating…' : 'Generate Research Prompt'}
        </button>
        <button
          onClick={() => setShowImport(true)}
          className="px-3 py-1.5 text-xs font-mono text-muted border border-surface2 rounded hover:text-text hover:border-accent/40 transition-colors"
        >
          Import Research Results
        </button>
      </div>
      {generatePrompt.isError && (
        <p className="text-xs font-mono text-red">{generatePrompt.error.message}</p>
      )}

      <hr className="border-surface2" />

      {research ? (
        <ResearchDisplay research={research} />
      ) : (
        <p className="text-xs font-mono text-muted italic">
          No research data yet. Generate a research prompt above and paste the results back in.
        </p>
      )}

      {showImport && (
        <ImportModal
          jobId={jobId}
          onClose={() => setShowImport(false)}
          onSuccess={() => void refetch()}
        />
      )}
      {promptText !== null && (
        <PromptModal prompt={promptText} onClose={() => setPromptText(null)} />
      )}
    </div>
  )
}
