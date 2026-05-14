import { describe, it, expect } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { server } from '@/test/mocks/server'
import { renderWithProviders } from '@/test/utils'
import LLMUsage from './LLMUsage'

describe('LLMUsage page', () => {
  it('renders the page heading', () => {
    renderWithProviders(<LLMUsage />)
    expect(screen.getByText('LLM Usage')).toBeInTheDocument()
  })

  it('shows loading state initially', () => {
    renderWithProviders(<LLMUsage />)
    expect(screen.getByText('Loading…')).toBeInTheDocument()
  })

  it('renders log entries after data loads', async () => {
    renderWithProviders(<LLMUsage />)
    await waitFor(() => expect(screen.getByText('evaluation')).toBeInTheDocument())
  })

  it('renders token summary after data loads', async () => {
    renderWithProviders(<LLMUsage />)
    // total_tokens_actual = 145, prompt = 95, completion = 50
    await waitFor(() => expect(screen.getByText('145 (95p + 50c)')).toBeInTheDocument())
  })

  it('shows latency after data loads', async () => {
    renderWithProviders(<LLMUsage />)
    // latency_ms = 1200 → "1.2s"
    await waitFor(() => expect(screen.getByText('1.2s')).toBeInTheDocument())
  })

  it('shows error message on failure', async () => {
    server.use(http.get('/api/v1/llm-call-log', () => new HttpResponse(null, { status: 500 })))
    renderWithProviders(<LLMUsage />)
    // The page renders (error as Error).message which will be the fetch error string
    await waitFor(() => expect(screen.getByText(/llm-call-log/)).toBeInTheDocument())
  })

  it('shows empty state when no log entries exist', async () => {
    server.use(http.get('/api/v1/llm-call-log', () => HttpResponse.json([])))
    renderWithProviders(<LLMUsage />)
    await waitFor(() => expect(screen.getByText('No LLM calls recorded yet.')).toBeInTheDocument())
  })

  it('shows success badge for successful calls', async () => {
    renderWithProviders(<LLMUsage />)
    await waitFor(() => expect(screen.getByText('ok')).toBeInTheDocument())
  })

  it('renders job id reference for entries with job_id', async () => {
    renderWithProviders(<LLMUsage />)
    await waitFor(() => expect(screen.getByText(/job #1/)).toBeInTheDocument())
  })

  it('renders the filter controls', async () => {
    renderWithProviders(<LLMUsage />)
    expect(screen.getAllByRole('combobox').length).toBeGreaterThan(0)
  })
})
