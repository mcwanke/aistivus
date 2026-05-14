import { describe, it, expect } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { server } from '@/test/mocks/server'
import { renderWithProviders } from '@/test/utils'
import ApplicationDetail from './ApplicationDetail'

describe('ApplicationDetail', () => {
  it('shows loading state initially', () => {
    renderWithProviders(<ApplicationDetail applicationId={1} />)
    expect(screen.getByText('Loading application…')).toBeInTheDocument()
  })

  it('shows error state on failure', async () => {
    server.use(http.get('/api/v1/applications/:id', () => new HttpResponse(null, { status: 404 })))
    renderWithProviders(<ApplicationDetail applicationId={1} />)
    await waitFor(() => expect(screen.getByText('Failed to load application.')).toBeInTheDocument())
  })

  it('renders job title after data loads', async () => {
    renderWithProviders(<ApplicationDetail applicationId={1} />)
    await waitFor(() => expect(screen.getByText('Senior Engineer')).toBeInTheDocument())
  })

  it('renders company name after data loads', async () => {
    renderWithProviders(<ApplicationDetail applicationId={1} />)
    await waitFor(() => expect(screen.getByText('Acme Corp')).toBeInTheDocument())
  })

  it('renders current application status badge', async () => {
    renderWithProviders(<ApplicationDetail applicationId={1} />)
    // "applied" appears in both the status badge span and the dropdown options
    await waitFor(() => expect(screen.getAllByText('applied').length).toBeGreaterThan(0))
  })

  it('renders View Job link', async () => {
    renderWithProviders(<ApplicationDetail applicationId={1} />)
    await waitFor(() => expect(screen.getByRole('link', { name: 'View Job →' })).toBeInTheDocument())
  })

  it('renders Status section', async () => {
    renderWithProviders(<ApplicationDetail applicationId={1} />)
    await waitFor(() => expect(screen.getByText('Status')).toBeInTheDocument())
  })

  it('renders Logs section', async () => {
    renderWithProviders(<ApplicationDetail applicationId={1} />)
    await waitFor(() => expect(screen.getByText(/Logs/)).toBeInTheDocument())
  })

  it('shows no logs message when logs are empty', async () => {
    renderWithProviders(<ApplicationDetail applicationId={1} />)
    await waitFor(() => expect(screen.getByText('No log entries yet.')).toBeInTheDocument())
  })

  it('renders the add log form', async () => {
    renderWithProviders(<ApplicationDetail applicationId={1} />)
    await waitFor(() => expect(screen.getByPlaceholderText('Log entry…')).toBeInTheDocument())
  })

  it('renders log type selector in add log form', async () => {
    renderWithProviders(<ApplicationDetail applicationId={1} />)
    await waitFor(() => expect(screen.getByText('General')).toBeInTheDocument())
  })

  it('renders status change dropdown', async () => {
    renderWithProviders(<ApplicationDetail applicationId={1} />)
    // Status select renders the STATUSES array options
    await waitFor(() => expect(screen.getByText('draft')).toBeInTheDocument())
  })

  it('renders Generate Prompt button', async () => {
    renderWithProviders(<ApplicationDetail applicationId={1} />)
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /Generate Prompt/ })).toBeInTheDocument(),
    )
  })
})
