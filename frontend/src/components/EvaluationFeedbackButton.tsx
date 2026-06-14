import { useState } from 'react'
import { useSubmitPromptFeedback } from '@/hooks/useEvaluate'
import type { PromptFeedbackPayload } from '@/types/api'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface EvaluationFeedbackButtonProps {
  promptType: 'evaluation_internal' | 'evaluation_external'
  evaluationId: number
  llmCallLogId?: number
  // When isOpen is provided the component is in controlled mode — no trigger
  // button is rendered; the modal appears/disappears based on isOpen.
  isOpen?: boolean
  onClose?: () => void
}

type AgreeValue = 0 | 1

const DIMENSIONS = [
  { value: 'overall_score',   label: 'Overall Score' },
  { value: 'role_fit',        label: 'Role Fit' },
  { value: 'recommendation',  label: 'Recommendation' },
  { value: 'strengths_gaps',  label: 'Strengths & Gaps' },
  { value: 'general',         label: 'General' },
]

// ─── Modal ────────────────────────────────────────────────────────────────────

function FeedbackModal({
  promptType,
  evaluationId,
  llmCallLogId,
  onClose,
  onSubmitted,
}: {
  promptType: 'evaluation_internal' | 'evaluation_external'
  evaluationId: number
  llmCallLogId?: number
  onClose: () => void
  onSubmitted: () => void
}): React.JSX.Element {
  const [agree, setAgree] = useState<AgreeValue | null>(null)
  const [dimension, setDimension] = useState<string | null>(null)
  const [feedbackText, setFeedbackText] = useState('')
  const submitMutation = useSubmitPromptFeedback()

  async function handleSubmit(): Promise<void> {
    if (agree === null) return
    const payload: PromptFeedbackPayload = {
      prompt_type: promptType,
      evaluation_id: evaluationId,
      ...(llmCallLogId !== undefined ? { llm_call_log_id: llmCallLogId } : {}),
      agree,
      ...(agree === 0 && dimension ? { dimension } : {}),
      ...(feedbackText.trim() ? { feedback_text: feedbackText.trim() } : {}),
    }
    await submitMutation.mutateAsync(payload)
    onSubmitted()
  }

  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
      <div className="bg-surface border border-surface2 rounded-xl p-7 max-w-md w-full shadow-2xl">
        <p className="font-serif text-accent text-lg mb-1">Rate this evaluation</p>
        <p className="text-sm text-muted mb-5 leading-relaxed">
          Your feedback helps improve future evaluations. Nothing is shown to you — it's stored for review.
        </p>

        {/* Agree / Disagree */}
        <div className="mb-4">
          <p className="text-[10px] font-mono text-muted uppercase tracking-wider mb-2">
            Does this evaluation look accurate?
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => { setAgree(1); setDimension(null) }}
              className={`flex-1 py-2 text-sm font-sans rounded border transition-colors ${
                agree === 1
                  ? 'bg-green/10 border-green text-green'
                  : 'border-surface2 text-muted hover:text-text'
              }`}
            >
              Agree
            </button>
            <button
              onClick={() => setAgree(0)}
              className={`flex-1 py-2 text-sm font-sans rounded border transition-colors ${
                agree === 0
                  ? 'bg-red/10 border-red text-red'
                  : 'border-surface2 text-muted hover:text-text'
              }`}
            >
              Disagree
            </button>
          </div>
        </div>

        {/* Dimension selector — only when disagreeing */}
        {agree === 0 && (
          <div className="mb-4">
            <p className="text-[10px] font-mono text-muted uppercase tracking-wider mb-2">
              What was off? (optional)
            </p>
            <div className="flex flex-wrap gap-1.5">
              {DIMENSIONS.map((d) => (
                <button
                  key={d.value}
                  onClick={() => setDimension(dimension === d.value ? null : d.value)}
                  className={`px-3 py-1 text-xs font-mono rounded border transition-colors ${
                    dimension === d.value
                      ? 'bg-accent/10 border-accent text-accent'
                      : 'border-surface2 text-muted hover:text-text hover:border-accent/40'
                  }`}
                >
                  {d.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Comment */}
        <div className="mb-6">
          <p className="text-[10px] font-mono text-muted uppercase tracking-wider mb-2">
            Any specifics? (optional)
          </p>
          <textarea
            value={feedbackText}
            onChange={(e) => setFeedbackText(e.target.value.slice(0, 200))}
            placeholder="Any specifics?"
            rows={3}
            className="w-full bg-surface border border-surface2 rounded px-3 py-2 text-sm font-mono text-muted focus:outline-none focus:border-accent/50 resize-none"
          />
          {feedbackText.length > 0 && (
            <p className="text-[10px] font-mono text-muted text-right mt-0.5">
              {feedbackText.length}/200
            </p>
          )}
        </div>

        {submitMutation.isError && (
          <p className="text-xs font-mono text-red mb-3">Failed to submit — please try again.</p>
        )}

        <div className="flex justify-end gap-2">
          <button
            onClick={onClose}
            disabled={submitMutation.isPending}
            className="px-4 py-2 text-sm font-sans bg-surface2 text-muted border border-surface2 rounded hover:text-text transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={() => void handleSubmit()}
            disabled={agree === null || submitMutation.isPending}
            className="px-4 py-2 text-sm font-sans bg-accent text-bg rounded hover:bg-accent/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {submitMutation.isPending ? 'Submitting…' : 'Submit'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function EvaluationFeedbackButton({
  promptType,
  evaluationId,
  llmCallLogId,
  isOpen,
  onClose,
}: EvaluationFeedbackButtonProps): React.JSX.Element {
  const [internalOpen, setInternalOpen] = useState(false)
  const [submitted, setSubmitted] = useState(false)

  const controlled = isOpen !== undefined
  const modalVisible = controlled ? isOpen : internalOpen

  function handleClose(): void {
    if (controlled) {
      onClose?.()
    } else {
      setInternalOpen(false)
    }
  }

  function handleSubmitted(): void {
    setSubmitted(true)
    handleClose()
  }

  return (
    <>
      {/* Trigger card — only in uncontrolled mode */}
      {!controlled && (
        <div className="border border-surface2 rounded-lg px-4 py-3 flex items-center justify-between gap-4">
          <p className="text-xs font-mono text-muted/70 leading-relaxed">
            Help improve future evaluations by rating this result.
          </p>
          {submitted ? (
            <span className="text-xs font-mono text-muted/60 whitespace-nowrap">Feedback submitted</span>
          ) : (
            <button
              onClick={() => setInternalOpen(true)}
              className="px-3 py-1.5 text-xs font-mono text-muted border border-surface2 rounded hover:text-text hover:border-accent/40 transition-colors whitespace-nowrap shrink-0"
            >
              Rate this evaluation
            </button>
          )}
        </div>
      )}

      {modalVisible && (
        <FeedbackModal
          promptType={promptType}
          evaluationId={evaluationId}
          llmCallLogId={llmCallLogId}
          onClose={handleClose}
          onSubmitted={handleSubmitted}
        />
      )}
    </>
  )
}
