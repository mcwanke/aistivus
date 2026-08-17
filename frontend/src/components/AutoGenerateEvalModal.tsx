import { useState, useEffect } from 'react'
import { useJobResearch } from '@/hooks/useJobs'
import { useQueryClient } from '@tanstack/react-query'

interface AutoGenerateEvalModalProps {
  jobId: number
  applicationId: number
  aiBackendMode: string | null
  onClose: () => void
}

export function AutoGenerateEvalModal({
  jobId,
  applicationId,
  aiBackendMode,
  onClose,
}: AutoGenerateEvalModalProps): React.JSX.Element {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [showResearchWarning, setShowResearchWarning] = useState(false)
  const { data: research } = useJobResearch(jobId)
  const qc = useQueryClient()

  // If no research, show warning first
  useEffect(() => {
    if (!loading && !research) {
      setShowResearchWarning(true)
    }
  }, [research, loading])

  async function handleContinue(): Promise<void> {
    setShowResearchWarning(false)
    setLoading(true)
    setError('')

    try {
      const response = await fetch(
        `/api/v1/applications/${applicationId}/generate-prompt?run_via_cli=true`,
        { method: 'POST' }
      )
      if (!response.ok) {
        const err = await response.json() as { detail?: string }
        throw new Error(err.detail || `HTTP ${response.status}`)
      }
      // Success: invalidate job query so evaluations auto-refresh
      void qc.invalidateQueries({ queryKey: ['job', jobId] })
      // Close modal - evaluations will auto-update via React Query
      onClose()
    } catch (err) {
      setError((err as Error).message)
      setLoading(false)
    }
  }

  function handleClose(): void {
    if (!loading) {
      setShowResearchWarning(false)
      setError('')
      onClose()
    }
  }

  // Research warning modal
  if (showResearchWarning) {
    return (
      <div className="fixed inset-0 bg-bg/80 flex items-center justify-center z-50 p-4">
        <div className="bg-surface rounded p-6 w-full max-w-md flex flex-col gap-4">
          <h2 className="font-serif text-accent text-lg">Research Missing</h2>
          <p className="text-xs font-mono text-muted">
            Research does not yet exist for this job. Without research context,
            evaluation scores will be based on job description signals only.
          </p>
          <div className="flex gap-2 justify-end">
            <button
              onClick={handleClose}
              className="px-3 py-1.5 text-xs font-mono text-muted border border-surface2 rounded hover:text-text transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={() => void handleContinue()}
              className="px-3 py-1.5 text-xs font-mono text-bg bg-accent rounded hover:bg-accent/90"
            >
              Continue Without Research
            </button>
          </div>
        </div>
      </div>
    )
  }

  // Main auto-gen modal
  return (
    <div className="fixed inset-0 bg-bg/80 flex items-center justify-center z-50 p-4">
      <div className="bg-surface rounded p-6 w-full max-w-md flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h2 className="font-serif text-accent text-lg">
            {loading ? 'Generating Evaluation…' : 'Auto-Generate Evaluation'}
          </h2>
          <button
            onClick={handleClose}
            disabled={loading}
            className="text-xs px-3 py-1.5 text-muted hover:text-text transition-colors disabled:opacity-50"
          >
            {loading ? '—' : 'Close'}
          </button>
        </div>

        {loading ? (
          <div className="py-8 text-center space-y-4">
            <div className="inline-block">
              <div className="w-8 h-8 border-2 border-accent/30 border-t-accent rounded-full animate-spin" />
            </div>
            <p className="text-xs font-mono text-muted">
              Running evaluation via {aiBackendMode}…
            </p>
          </div>
        ) : error ? (
          <div className="space-y-3">
            <p className="text-xs font-mono text-red bg-red/10 rounded p-3">
              {error}
            </p>
            {error.includes('timed out') ? (
              <div className="text-xs font-mono text-muted">
                The evaluation took too long. Try with a shorter job description, or use manual import.
              </div>
            ) : (
              <div className="text-xs font-mono text-muted">
                Try manual import or check that Claude CLI is installed and authenticated.
              </div>
            )}
          </div>
        ) : (
          <p className="text-xs font-mono text-muted">
            Click "Generate" to run the evaluation via {aiBackendMode}.
          </p>
        )}

        {/* Footer button row */}
        <div className="flex gap-2 justify-end pt-2 border-t border-surface2">
          <button
            onClick={handleClose}
            disabled={loading}
            className="px-3 py-1.5 text-xs font-mono text-muted border border-surface2 rounded hover:text-text hover:border-accent/40 transition-colors disabled:opacity-50"
          >
            {loading ? 'Generating…' : 'Cancel'}
          </button>
          <button
            onClick={() => void handleContinue()}
            disabled={loading}
            className="px-3 py-1.5 text-xs font-mono text-bg bg-accent rounded hover:bg-accent/90 disabled:opacity-50"
          >
            {loading ? 'Generating…' : 'Generate'}
          </button>
        </div>
      </div>
    </div>
  )
}
