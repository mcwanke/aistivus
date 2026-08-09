import { useState } from 'react'
import { useJobResearch } from '@/hooks/useJobs'
import type { JobResearch } from '@/types/api'

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
  onNavigateToApplyWorkflow?: () => void
}

export function ResearchSubpage({ jobId, onNavigateToApplyWorkflow }: ResearchSubpageProps): React.JSX.Element {
  const [copiedJson, setCopiedJson] = useState(false)
  const { data: research, isLoading, isError } = useJobResearch(jobId)

  async function handleCopyResearchJson(): Promise<void> {
    if (!research?.raw_json) return
    await navigator.clipboard.writeText(research.raw_json)
    setCopiedJson(true)
    setTimeout(() => setCopiedJson(false), 2000)
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
      <div className="flex gap-2 flex-wrap items-center">
        {onNavigateToApplyWorkflow && (
          <button
            onClick={onNavigateToApplyWorkflow}
            className="text-xs font-mono text-accent hover:underline"
          >
            ← Back to Research Workflow
          </button>
        )}
        {research?.raw_json && (
          <button
            onClick={() => void handleCopyResearchJson()}
            className="px-3 py-1.5 text-xs font-mono text-muted border border-surface2 rounded hover:text-text hover:border-accent/40 transition-colors"
          >
            {copiedJson ? 'Copied!' : 'Copy Research JSON'}
          </button>
        )}
      </div>

      <hr className="border-surface2" />

      {research ? (
        <ResearchDisplay research={research} />
      ) : (
        <p className="text-xs font-mono text-muted italic">
          No research data yet. Use the Research Workflow in Apply Workflow to generate and import research.
        </p>
      )}
    </div>
  )
}
