import { useState, useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'

interface OrgCompanyResearchWorkerModalProps {
  orgId: number
  onClose: () => void
}

interface SubmitResponse {
  success: boolean
  worker_id?: number
  detail?: string
}

export function OrgCompanyResearchWorkerModal({
  orgId,
  onClose,
}: OrgCompanyResearchWorkerModalProps): React.JSX.Element {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const qc = useQueryClient()

  // Auto-close after successful submission
  useEffect(() => {
    if (submitted) {
      const timer = setTimeout(onClose, 2000)
      return () => clearTimeout(timer)
    }
  }, [submitted, onClose])

  async function handleGenerate(): Promise<void> {
    setLoading(true)
    setError('')

    try {
      const response = await fetch(`/api/v1/orgs/${orgId}/queue-research-worker`, {
        method: 'POST',
      })

      if (!response.ok) {
        const err = (await response.json().catch(() => ({}))) as SubmitResponse
        throw new Error(err.detail || `HTTP ${response.status}`)
      }

      setSubmitted(true)

      // Invalidate org queries to refresh
      setTimeout(() => {
        void qc.invalidateQueries({ queryKey: ['org', orgId] })
        void qc.invalidateQueries({ queryKey: ['org-research', orgId] })
      }, 500)
    } catch (err) {
      setError((err as Error).message)
      setLoading(false)
    }
  }

  function handleClose(): void {
    if (!loading) {
      setError('')
      onClose()
    }
  }

  return (
    <div className="fixed inset-0 bg-bg/80 flex items-center justify-center z-50 p-4">
      <div className="bg-surface rounded p-6 w-full max-w-md flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h2 className="font-serif text-accent text-lg">
            {submitted ? 'Queued!' : 'Company Research'}
          </h2>
          <button
            onClick={handleClose}
            disabled={loading}
            className="text-xs px-3 py-1.5 text-muted hover:text-text transition-colors disabled:opacity-50"
          >
            {loading ? '—' : 'Close'}
          </button>
        </div>

        {submitted ? (
          <div className="py-8 text-center space-y-4">
            <div className="text-2xl text-green-400">✓</div>
            <p className="text-xs font-mono text-muted">
              Company research queued to run in the background.
            </p>
            <p className="text-xs font-mono text-muted/60">
              Check the Worker Dashboard in a few moments for results.
            </p>
          </div>
        ) : loading ? (
          <div className="py-8 text-center space-y-4">
            <div className="inline-block">
              <div className="w-8 h-8 border-2 border-accent/30 border-t-accent rounded-full animate-spin" />
            </div>
            <p className="text-xs font-mono text-muted">
              Queuing research…
            </p>
          </div>
        ) : error ? (
          <div className="space-y-3">
            <p className="text-xs font-mono text-red-400 bg-red-400/10 rounded p-3">
              {error}
            </p>
            <div className="text-xs font-mono text-muted">
              Try again or check the Worker Dashboard for details.
            </div>
          </div>
        ) : (
          <p className="text-xs font-mono text-muted">
            Research will run in the background via Claude CLI. You can close this modal and continue working.
          </p>
        )}

        {/* Footer button row */}
        {!submitted && (
          <div className="flex gap-2 justify-end pt-2 border-t border-surface2">
            <button
              onClick={handleClose}
              disabled={loading}
              className="px-3 py-1.5 text-xs font-mono text-muted border border-surface2 rounded hover:text-text hover:border-accent/40 transition-colors disabled:opacity-50"
            >
              {loading ? 'Queuing…' : 'Cancel'}
            </button>
            <button
              onClick={() => void handleGenerate()}
              disabled={loading}
              className="px-3 py-1.5 text-xs font-mono text-bg bg-accent rounded hover:bg-accent/90 disabled:opacity-50"
            >
              {loading ? 'Queuing…' : 'Generate'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
