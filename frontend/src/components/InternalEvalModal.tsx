import { useEffect, useRef, useState } from 'react'
import type { InternalEvalEvent } from '@/hooks/useEvaluate'

interface Props {
  onEvent: (handler: (evt: InternalEvalEvent) => void) => void
  onClose: () => void
}

const SECONDS_PER_STEP = 7
const TOTAL_STEPS = 4

export function InternalEvalModal({ onEvent, onClose }: Props): React.JSX.Element {
  const [currentStep, setCurrentStep] = useState(0)
  const [currentLabel, setCurrentLabel] = useState('Starting…')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [isDone, setIsDone] = useState(false)
  const [secondsRemaining, setSecondsRemaining] = useState(TOTAL_STEPS * SECONDS_PER_STEP)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const startedRef = useRef(false)

  // Register event handler
  useEffect(() => {
    onEvent((evt: InternalEvalEvent) => {
      if (evt.event === 'step_start') {
        if (!startedRef.current) {
          startedRef.current = true
          timerRef.current = setInterval(() => {
            setSecondsRemaining(prev => Math.max(prev - 1, 0))
          }, 1000)
        }
        setCurrentStep(evt.step ?? 0)
        setCurrentLabel(evt.label ?? '')
        const remaining = ((TOTAL_STEPS - (evt.step ?? 1) + 1)) * SECONDS_PER_STEP
        setSecondsRemaining(remaining)
      } else if (evt.event === 'step_complete') {
        // step_complete event received; no additional state needed
      } else if (evt.event === 'done') {
        if (timerRef.current) clearInterval(timerRef.current)
        setIsDone(true)
        // parent closes the modal after a brief pause to show done state
        setTimeout(onClose, 600)
      } else if (evt.event === 'error') {
        if (timerRef.current) clearInterval(timerRef.current)
        setErrorMessage(evt.message ?? 'An unknown error occurred.')
      }
    })
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [onEvent, onClose])

  const timeLabel =
    isDone
      ? 'complete'
      : secondsRemaining <= 0
      ? 'almost done…'
      : `~${secondsRemaining}s remaining`

  return (
    <div className="fixed inset-0 bg-bg/80 flex items-center justify-center z-50 p-4">
      <div className="bg-surface rounded p-8 w-full max-w-md flex flex-col items-center gap-6">
        <h2 className="font-serif text-accent text-lg self-start">
          Running Internal Evaluation
        </h2>

        {!errorMessage && (
          <>
            {/* Spinner */}
            <div className="flex items-center justify-center w-12 h-12">
              <div className="w-10 h-10 border-2 border-surface2 border-t-accent rounded-full animate-spin" />
            </div>

            {/* Step counter + label */}
            <div className="text-center">
              <p className="text-sm font-mono text-text">
                Step {currentStep} / {TOTAL_STEPS} — {currentLabel}
              </p>
              <p className="text-xs font-mono text-muted mt-1">{timeLabel}</p>
            </div>
          </>
        )}

        {errorMessage && (
          <div className="w-full bg-surface2 rounded p-4 text-xs font-mono text-red leading-relaxed">
            {errorMessage}
          </div>
        )}

        {/* Cancel / Close */}
        <div className="self-end">
          {errorMessage ? (
            <button
              onClick={onClose}
              className="px-3 py-1.5 text-xs font-mono text-muted border border-surface2 rounded hover:text-text hover:border-accent/40 transition-colors"
            >
              Close
            </button>
          ) : (
            <button
              disabled
              title="Cannot cancel an in-progress evaluation"
              className="px-3 py-1.5 text-xs font-mono text-muted border border-surface2 rounded opacity-40 cursor-not-allowed"
            >
              Cancel
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
