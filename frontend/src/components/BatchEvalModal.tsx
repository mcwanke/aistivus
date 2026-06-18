import { useState, useEffect, useRef, useCallback } from 'react'
import { useQueryClient } from '@tanstack/react-query'

// ─── Types ────────────────────────────────────────────────────────────────────

interface BatchJob {
  job_id: number
  company_name: string
  title: string
}

type JobStatus = 'pending' | 'running' | 'done' | 'failed'

interface JobState {
  job_id: number
  company_name: string
  title: string
  status: JobStatus
  score: number | null
  error: string | null
}

interface BatchEvalModalProps {
  jobs: BatchJob[]
  modelId: number
  modelName: string
  onClose: () => void
}

// ─── Re-evaluate fetch ────────────────────────────────────────────────────────

async function reEvaluateJob(
  jobId: number,
  modelId: number,
): Promise<{ score_overall: number | null }> {
  const res = await fetch(`/api/v1/jobs/${jobId}/re-evaluate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ llm_model_id: modelId }),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText)
    throw new Error(text || `${res.status}`)
  }
  const data = (await res.json()) as { evaluation?: { score_overall?: number | null } }
  return { score_overall: data.evaluation?.score_overall ?? null }
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function BatchEvalModal({
  jobs,
  modelId,
  modelName,
  onClose,
}: BatchEvalModalProps): React.JSX.Element {
  const qc = useQueryClient()
  const stopRef = useRef(false)

  const [jobStates, setJobStates] = useState<JobState[]>(() =>
    jobs.map(j => ({ ...j, status: 'pending', score: null, error: null }))
  )
  const [currentIndex, setCurrentIndex] = useState<number | null>(null)
  const [completedCount, setCompletedCount] = useState(0)
  const [stopped, setStopped] = useState(false)
  const [finished, setFinished] = useState(false)

  // Running time estimate
  const elapsed = useRef<number[]>([])

  function estimateRemaining(remaining: number): string {
    if (elapsed.current.length === 0) return '—'
    const avg = elapsed.current.reduce((a, b) => a + b, 0) / elapsed.current.length
    const ms = avg * remaining
    if (ms < 60_000) return `~${Math.round(ms / 1000)}s`
    return `~${Math.round(ms / 60_000)}m`
  }

  const runBatch = useCallback(async () => {
    for (let i = 0; i < jobs.length; i++) {
      if (stopRef.current) {
        setStopped(true)
        setCurrentIndex(null)
        setFinished(true)
        return
      }

      setCurrentIndex(i)
      setJobStates(prev =>
        prev.map((s, idx) => (idx === i ? { ...s, status: 'running' } : s))
      )

      const t0 = Date.now()
      try {
        const { score_overall } = await reEvaluateJob(jobs[i]!.job_id, modelId)
        elapsed.current.push(Date.now() - t0)
        setJobStates(prev =>
          prev.map((s, idx) =>
            idx === i ? { ...s, status: 'done', score: score_overall } : s
          )
        )
      } catch (err) {
        elapsed.current.push(Date.now() - t0)
        setJobStates(prev =>
          prev.map((s, idx) =>
            idx === i
              ? { ...s, status: 'failed', error: err instanceof Error ? err.message : 'error' }
              : s
          )
        )
      }

      setCompletedCount(i + 1)
    }

    setCurrentIndex(null)
    setFinished(true)
  }, [jobs, modelId])

  useEffect(() => {
    void runBatch()
  // runBatch is stable — only runs once on mount
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function handleStop(): void {
    stopRef.current = true
  }

  function handleClose(): void {
    void qc.invalidateQueries({ queryKey: ['applications'] })
    void qc.invalidateQueries({ queryKey: ['jobs'] })
    onClose()
  }

  const total = jobs.length
  const pct = total > 0 ? Math.round((completedCount / total) * 100) : 0
  const remaining = total - completedCount
  const isRunning = !finished && !stopped

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-surface rounded-lg w-full max-w-lg flex flex-col max-h-[80vh]">
        {/* Header */}
        <div className="px-5 pt-5 pb-3 border-b border-surface2 shrink-0">
          <h2 className="font-serif text-accent text-lg">Batch Evaluation</h2>
          <p className="text-xs font-mono text-muted mt-0.5">{modelName}</p>
        </div>

        {/* Progress */}
        <div className="px-5 py-4 border-b border-surface2 shrink-0">
          <div className="flex items-baseline justify-between mb-2">
            <span className="text-sm font-mono text-text">
              {stopped
                ? `Stopped — ${completedCount} of ${total} completed`
                : finished
                  ? `${completedCount} of ${total} complete`
                  : `${completedCount} of ${total} complete`}
            </span>
            <span className="text-xs font-mono text-muted">{pct}%</span>
          </div>

          {/* Progress bar */}
          <div className="h-1.5 bg-surface2 rounded overflow-hidden">
            <div
              className="h-full bg-accent rounded transition-all duration-300"
              style={{ width: `${pct}%` }}
            />
          </div>

          {isRunning && currentIndex !== null && (
            <div className="mt-2 text-xs font-mono text-muted">
              <span className="text-text">Now: </span>
              {jobs[currentIndex]!.company_name} — {jobs[currentIndex]!.title}
              {remaining > 0 && (
                <span className="ml-3">Est. remaining: {estimateRemaining(remaining)}</span>
              )}
            </div>
          )}
        </div>

        {/* Job list */}
        <div className="flex-1 overflow-y-auto px-5 py-3 space-y-1">
          {jobStates.map(j => (
            <div key={j.job_id} className="flex items-center gap-2 py-1">
              <span className="w-4 shrink-0 text-center text-sm">
                {j.status === 'done'    ? '✓' :
                 j.status === 'failed'  ? '✗' :
                 j.status === 'running' ? '⋯' :
                                          '○'}
              </span>
              <span className={`text-xs font-mono flex-1 truncate ${
                j.status === 'done'    ? 'text-text' :
                j.status === 'failed'  ? 'text-red'  :
                j.status === 'running' ? 'text-accent' :
                                          'text-muted'
              }`}>
                {j.company_name} — {j.title}
              </span>
              <span className="text-xs font-mono text-muted shrink-0 w-16 text-right">
                {j.status === 'done'    && j.score != null ? `${j.score.toFixed(1)}/10` :
                 j.status === 'done'    ? '—' :
                 j.status === 'failed'  ? 'failed' :
                 j.status === 'running' ? 'running…' :
                                          'pending'}
              </span>
            </div>
          ))}
        </div>

        {/* Footer buttons */}
        <div className="px-5 py-4 border-t border-surface2 flex justify-end gap-3 shrink-0">
          {isRunning && (
            <button
              onClick={handleStop}
              className="px-4 py-1.5 text-sm font-mono border border-surface2 rounded text-muted hover:text-text hover:border-text/30 transition-colors"
            >
              Stop
            </button>
          )}
          <button
            onClick={() => { handleStop(); handleClose(); }}
            className="px-4 py-1.5 text-sm font-mono bg-accent text-bg rounded hover:bg-accent/80 transition-colors"
          >
            {isRunning ? 'Stop & Close' : 'Close'}
          </button>
        </div>
      </div>
    </div>
  )
}
