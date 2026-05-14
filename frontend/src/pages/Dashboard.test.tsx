import { describe, it, expect } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { server } from '@/test/mocks/server'
import { renderWithProviders } from '@/test/utils'
import Dashboard from './Dashboard'

describe('Dashboard', () => {
  it('shows loading states initially', () => {
    renderWithProviders(<Dashboard />)
    expect(screen.getByText('Loading stats…')).toBeInTheDocument()
    expect(screen.getByText('Checking models…')).toBeInTheDocument()
  })

  it('renders stat cards after data loads', async () => {
    renderWithProviders(<Dashboard />)
    await waitFor(() => expect(screen.getByText('5')).toBeInTheDocument())
    expect(screen.getByText('Jobs')).toBeInTheDocument()
    expect(screen.getByText('Evaluations')).toBeInTheDocument()
    expect(screen.getByText('Applications')).toBeInTheDocument()
    expect(screen.getByText('LLM Calls')).toBeInTheDocument()
  })

  it('renders model health section after data loads', async () => {
    renderWithProviders(<Dashboard />)
    await waitFor(() => expect(screen.getByText('llama3')).toBeInTheDocument())
    expect(screen.getByText('ok')).toBeInTheDocument()
    expect(screen.getByText('schema v1.0')).toBeInTheDocument()
  })

  it('shows error for stats on failure', async () => {
    server.use(http.get('/api/v1/stats', () => new HttpResponse(null, { status: 500 })))
    renderWithProviders(<Dashboard />)
    await waitFor(() => expect(screen.getByText('Failed to load stats.')).toBeInTheDocument())
  })

  it('shows error for health on failure', async () => {
    server.use(http.get('/api/v1/health', () => new HttpResponse(null, { status: 500 })))
    renderWithProviders(<Dashboard />)
    await waitFor(() => expect(screen.getByText('Failed to load health status.')).toBeInTheDocument())
  })

  it('shows "no models" message when models list is empty', async () => {
    server.use(
      http.get('/api/v1/health', () =>
        HttpResponse.json({
          status: 'ok',
          database: { schema_version: '1.0' },
          models: [],
          anthropic_configured: false,
          version: '1.0.0',
        }),
      ),
    )
    renderWithProviders(<Dashboard />)
    await waitFor(() =>
      expect(screen.getByText('No models configured. Add one in Settings.')).toBeInTheDocument(),
    )
  })

  it('shows degraded status badge', async () => {
    server.use(
      http.get('/api/v1/health', () =>
        HttpResponse.json({
          status: 'degraded',
          database: { schema_version: '1.0' },
          models: [],
          anthropic_configured: false,
          version: '1.0.0',
        }),
      ),
    )
    renderWithProviders(<Dashboard />)
    await waitFor(() => expect(screen.getByText('degraded')).toBeInTheDocument())
  })

  it('renders navigation links', async () => {
    renderWithProviders(<Dashboard />)
    await waitFor(() => expect(screen.getByText('5')).toBeInTheDocument())
    const links = screen.getAllByRole('link')
    const hrefs = links.map((l) => l.getAttribute('href'))
    expect(hrefs).toContain('/jobs')
    expect(hrefs).toContain('/applications')
  })
})
