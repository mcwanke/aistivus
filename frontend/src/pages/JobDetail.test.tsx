import { describe, it, expect } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { server } from '@/test/mocks/server'
import { renderWithProviders } from '@/test/utils'
import JobDetail from './JobDetail'

describe('JobDetail', () => {
  it('shows loading state initially', () => {
    renderWithProviders(<JobDetail jobId={1} />)
    expect(screen.getByText('Loading job details…')).toBeInTheDocument()
  })

  it('shows error state on failure', async () => {
    server.use(http.get('/api/v1/jobs/:id', () => new HttpResponse(null, { status: 404 })))
    renderWithProviders(<JobDetail jobId={1} />)
    await waitFor(() => expect(screen.getByText('Failed to load job.')).toBeInTheDocument())
  })

  it('renders job title and company after data loads', async () => {
    renderWithProviders(<JobDetail jobId={1} />)
    await waitFor(() => expect(screen.getByText('Senior Engineer')).toBeInTheDocument())
    expect(screen.getByText('Acme Corp')).toBeInTheDocument()
  })

  it('renders location info', async () => {
    renderWithProviders(<JobDetail jobId={1} />)
    // Location is rendered as "📍 Remote" inside a span
    await waitFor(() => expect(screen.getByText(/📍/)).toBeInTheDocument())
  })

  it('renders My Ratings section', async () => {
    renderWithProviders(<JobDetail jobId={1} />)
    await waitFor(() => expect(screen.getByText('My Ratings')).toBeInTheDocument())
  })

  it('renders Application section', async () => {
    renderWithProviders(<JobDetail jobId={1} />)
    await waitFor(() => expect(screen.getByText('Application')).toBeInTheDocument())
  })

  it('renders Edit buttons', async () => {
    renderWithProviders(<JobDetail jobId={1} />)
    await waitFor(() => expect(screen.getAllByText('Edit').length).toBeGreaterThan(0))
  })

  it('opens Edit Job modal on first Edit click', async () => {
    const user = userEvent.setup()
    renderWithProviders(<JobDetail jobId={1} />)
    await waitFor(() => screen.getAllByText('Edit'))
    await user.click(screen.getAllByText('Edit')[0])
    await waitFor(() => expect(screen.getByText('Edit Job')).toBeInTheDocument())
  })

  it('renders Description collapsible section', async () => {
    renderWithProviders(<JobDetail jobId={1} />)
    await waitFor(() => expect(screen.getByText('Description')).toBeInTheDocument())
  })

  it('renders Evaluations collapsible section', async () => {
    renderWithProviders(<JobDetail jobId={1} />)
    await waitFor(() => expect(screen.getByText(/Evaluations/)).toBeInTheDocument())
  })

  it('shows no evaluations message when evaluations are empty', async () => {
    renderWithProviders(<JobDetail jobId={1} />)
    await waitFor(() => expect(screen.getByText('No evaluations yet.')).toBeInTheDocument())
  })
})
