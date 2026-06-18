import { describe, it, expect, vi } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { server } from '@/test/mocks/server'
import { renderWithProviders } from '@/test/utils'
import BatchEvalModal from './BatchEvalModal'

const JOBS = [
  { job_id: 1, company_name: 'Acme Corp', title: 'Senior Engineer' },
  { job_id: 2, company_name: 'Globex', title: 'PM' },
]

const SUCCESS_RESPONSE = { success: true, evaluation_id: 10, job_id: 1, evaluation: { score_overall: 7.5 }, error: null, duplicate_detected: false, existing_jobs: null, prompt_usage_id: null }

function successHandler() {
  return http.post('/api/v1/jobs/:id/re-evaluate', () => HttpResponse.json(SUCCESS_RESPONSE))
}

function failHandler(jobId: number) {
  return http.post(`/api/v1/jobs/${jobId}/re-evaluate`, () => new HttpResponse(null, { status: 422 }), { once: true })
}

describe('BatchEvalModal', () => {
  it('renders with correct job count in header', async () => {
    server.use(successHandler())
    renderWithProviders(
      <BatchEvalModal jobs={JOBS} modelId={1} modelName="llama3" onClose={vi.fn()} />
    )
    expect(screen.getByText('llama3')).toBeInTheDocument()
    expect(screen.getByText('Batch Evaluation')).toBeInTheDocument()
  })

  it('shows all jobs in pending state initially', () => {
    server.use(successHandler())
    renderWithProviders(
      <BatchEvalModal jobs={JOBS} modelId={1} modelName="llama3" onClose={vi.fn()} />
    )
    expect(screen.getAllByText('Acme Corp — Senior Engineer').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Globex — PM').length).toBeGreaterThan(0)
  })

  it('shows completion state after all jobs finish', async () => {
    server.use(successHandler())
    renderWithProviders(
      <BatchEvalModal jobs={JOBS} modelId={1} modelName="llama3" onClose={vi.fn()} />
    )
    await waitFor(
      () => expect(screen.getByText('2 of 2 complete')).toBeInTheDocument(),
      { timeout: 3000 },
    )
  })

  it('shows failed row on API error and continues processing', async () => {
    server.use(
      failHandler(1),
      successHandler(),
    )
    renderWithProviders(
      <BatchEvalModal jobs={JOBS} modelId={1} modelName="llama3" onClose={vi.fn()} />
    )
    await waitFor(
      () => expect(screen.getByText('2 of 2 complete')).toBeInTheDocument(),
      { timeout: 3000 },
    )
    // Both rows should have a status indicator (✓ or ✗)
    const ticks = screen.getAllByText('✓')
    const crosses = screen.queryAllByText('✗')
    expect(ticks.length + crosses.length).toBe(2)
  })

  it('calls onClose when Close button is clicked after completion', async () => {
    server.use(successHandler())
    const onClose = vi.fn()
    renderWithProviders(
      <BatchEvalModal jobs={JOBS} modelId={1} modelName="llama3" onClose={onClose} />
    )
    await waitFor(
      () => expect(screen.getByRole('button', { name: 'Close' })).toBeInTheDocument(),
      { timeout: 3000 },
    )
    await userEvent.click(screen.getByRole('button', { name: 'Close' }))
    expect(onClose).toHaveBeenCalled()
  })

  it('calls re-evaluate exactly once per job (no double-fire)', async () => {
    let callCount = 0
    server.use(
      http.post('/api/v1/jobs/:id/re-evaluate', () => {
        callCount++
        return HttpResponse.json(SUCCESS_RESPONSE)
      }),
    )
    renderWithProviders(
      <BatchEvalModal jobs={JOBS} modelId={1} modelName="llama3" onClose={vi.fn()} />
    )
    await waitFor(
      () => expect(screen.getByText('2 of 2 complete')).toBeInTheDocument(),
      { timeout: 3000 },
    )
    expect(callCount).toBe(2)
  })

  it('shows Stop button while running', () => {
    // Use a handler that never resolves to keep the modal in running state
    server.use(
      http.post('/api/v1/jobs/:id/re-evaluate', async () => {
        await new Promise(() => {}) // never resolves
        return HttpResponse.json(SUCCESS_RESPONSE)
      }),
    )
    renderWithProviders(
      <BatchEvalModal jobs={JOBS} modelId={1} modelName="llama3" onClose={vi.fn()} />
    )
    expect(screen.getByRole('button', { name: 'Stop' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Stop & Close' })).toBeInTheDocument()
  })
})
