import { describe, it, expect } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { server } from '@/test/mocks/server'
import { renderWithProviders } from '@/test/utils'
import Dashboard from './Dashboard'

describe('Dashboard', () => {
  it('shows loading states initially', () => {
    renderWithProviders(<Dashboard />)
    expect(screen.getByText('Checking models…')).toBeInTheDocument()
  })

  it('renders stat cards after data loads', async () => {
    renderWithProviders(<Dashboard />)
    await waitFor(() => expect(screen.getByText('Evaluations Run')).toBeInTheDocument())
    expect(screen.getByText('Open Jobs')).toBeInTheDocument()
    expect(screen.getByText('Jobs Applied To')).toBeInTheDocument()
    expect(screen.getByText('Applications In Process')).toBeInTheDocument()
  })

  it('renders correct stat values from mock data', async () => {
    renderWithProviders(<Dashboard />)
    // MOCK_STATS: evaluations=3, jobs=5, jobs_applied_to=4, applications_in_process=2
    await waitFor(() => expect(screen.getByText('3')).toBeInTheDocument())
    expect(screen.getByText('5')).toBeInTheDocument()
    expect(screen.getByText('4')).toBeInTheDocument()
    expect(screen.getByText('2')).toBeInTheDocument()
  })

  it('renders model health section after data loads', async () => {
    renderWithProviders(<Dashboard />)
    await waitFor(() => expect(screen.getByText('llama3')).toBeInTheDocument())
    expect(screen.getByText('ok')).toBeInTheDocument()
    expect(screen.getByText('schema v1.0')).toBeInTheDocument()
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
    await waitFor(() => expect(screen.getByText('Open Jobs')).toBeInTheDocument())
    const links = screen.getAllByRole('link')
    const hrefs = links.map((l) => l.getAttribute('href'))
    expect(hrefs).toContain('/jobs')
    expect(hrefs).toContain('/applications')
    expect(hrefs).toContain('/createjob')
    expect(hrefs).toContain('/llm-usage')
  })

  it('renders featured Jobs tile in hero', async () => {
    renderWithProviders(<Dashboard />)
    await waitFor(() => expect(screen.getByText('Find Me My Ideal Job')).toBeInTheDocument())
  })

  it('renders Tools section with correct tile titles', async () => {
    renderWithProviders(<Dashboard />)
    await waitFor(() => expect(screen.getByText('Create Job')).toBeInTheDocument())
    expect(screen.getByText('JS Profile')).toBeInTheDocument()
  })

  it('renders Data section with Applications and LLM Usage tiles', async () => {
    renderWithProviders(<Dashboard />)
    await waitFor(() => expect(screen.getByText('LLM Usage')).toBeInTheDocument())
    expect(screen.getByText('Applications')).toBeInTheDocument()
  })

  it('does not render Jobs tile in Tools section', async () => {
    renderWithProviders(<Dashboard />)
    await waitFor(() => expect(screen.getByText('Find Me My Ideal Job')).toBeInTheDocument())
    // "Jobs" appears only as a stat label (Open Jobs) and in the featured tile text, not as a standalone tile title
    const headings = screen.queryAllByText('Jobs')
    expect(headings).toHaveLength(0)
  })
})
