import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { screen, act, fireEvent } from '@testing-library/react'
import { renderWithProviders } from '@/test/utils'
import { InternalEvalModal } from './InternalEvalModal'
import type { InternalEvalEvent } from '@/hooks/useEvaluate'

function makeProps() {
  let capturedHandler: ((evt: InternalEvalEvent) => void) | null = null
  const onEvent = vi.fn((handler: (evt: InternalEvalEvent) => void) => {
    capturedHandler = handler
  })
  const onClose = vi.fn()

  function fireEvent(evt: InternalEvalEvent) {
    act(() => { capturedHandler?.(evt) })
  }

  return { onEvent, onClose, fireEvent }
}

describe('InternalEvalModal', () => {
  beforeEach(() => { vi.useFakeTimers() })
  afterEach(() => { vi.useRealTimers() })

  it('renders with step counter starting at 0/4', () => {
    const { onEvent, onClose } = makeProps()
    renderWithProviders(<InternalEvalModal onEvent={onEvent} onClose={onClose} />)
    expect(screen.getByText(/Step 0 \/ 4/)).toBeInTheDocument()
  })

  it('renders title and cancel button initially', () => {
    const { onEvent, onClose } = makeProps()
    renderWithProviders(<InternalEvalModal onEvent={onEvent} onClose={onClose} />)
    expect(screen.getByText('Running Internal Evaluation')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /cancel/i })).toBeDisabled()
  })

  it('updates step counter on step_start event', () => {
    const { onEvent, onClose, fireEvent } = makeProps()
    renderWithProviders(<InternalEvalModal onEvent={onEvent} onClose={onClose} />)
    fireEvent({ event: 'step_start', step: 1, total: 4, label: 'Analyzing role…' })
    expect(screen.getByText(/Step 1 \/ 4/)).toBeInTheDocument()
    expect(screen.getByText(/Analyzing role/)).toBeInTheDocument()
  })

  it('advances step counter through all 4 steps', () => {
    const { onEvent, onClose, fireEvent } = makeProps()
    renderWithProviders(<InternalEvalModal onEvent={onEvent} onClose={onClose} />)

    fireEvent({ event: 'step_start', step: 1, total: 4, label: 'Analyzing role…' })
    expect(screen.getByText(/Step 1 \/ 4/)).toBeInTheDocument()

    fireEvent({ event: 'step_start', step: 2, total: 4, label: 'Scoring screenability…' })
    expect(screen.getByText(/Step 2 \/ 4/)).toBeInTheDocument()

    fireEvent({ event: 'step_start', step: 3, total: 4, label: 'Scoring fit…' })
    expect(screen.getByText(/Step 3 \/ 4/)).toBeInTheDocument()

    fireEvent({ event: 'step_start', step: 4, total: 4, label: 'Synthesizing…' })
    expect(screen.getByText(/Step 4 \/ 4/)).toBeInTheDocument()
  })

  it('calls onClose after done event with 600ms delay', () => {
    const { onEvent, onClose, fireEvent } = makeProps()
    renderWithProviders(<InternalEvalModal onEvent={onEvent} onClose={onClose} />)

    fireEvent({ event: 'done', eval_id: 42 })

    expect(onClose).not.toHaveBeenCalled()
    act(() => { vi.advanceTimersByTime(600) })
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('shows error message on error event', () => {
    const { onEvent, onClose, fireEvent } = makeProps()
    renderWithProviders(<InternalEvalModal onEvent={onEvent} onClose={onClose} />)

    fireEvent({ event: 'error', message: 'LLM call failed at step 1' })

    expect(screen.getByText('LLM call failed at step 1')).toBeInTheDocument()
  })

  it('shows close button (not cancel) on error', () => {
    const { onEvent, onClose, fireEvent } = makeProps()
    renderWithProviders(<InternalEvalModal onEvent={onEvent} onClose={onClose} />)

    fireEvent({ event: 'error', message: 'Something went wrong' })

    const closeBtn = screen.getByRole('button', { name: /close/i })
    expect(closeBtn).toBeInTheDocument()
    expect(closeBtn).not.toBeDisabled()
  })

  it('calls onClose when Close button is clicked after error', () => {
    const { onEvent, onClose, fireEvent: dispatchEvent } = makeProps()
    renderWithProviders(<InternalEvalModal onEvent={onEvent} onClose={onClose} />)

    dispatchEvent({ event: 'error', message: 'Something went wrong' })

    // Use fireEvent (sync) — userEvent hangs under fake timers
    fireEvent.click(screen.getByRole('button', { name: /close/i }))
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('does not call onClose automatically on error', () => {
    const { onEvent, onClose, fireEvent } = makeProps()
    renderWithProviders(<InternalEvalModal onEvent={onEvent} onClose={onClose} />)

    fireEvent({ event: 'error', message: 'Something went wrong' })
    act(() => { vi.advanceTimersByTime(2000) })

    expect(onClose).not.toHaveBeenCalled()
  })
})
