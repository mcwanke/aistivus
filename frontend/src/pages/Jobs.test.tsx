import { describe, it, expect, vi } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { server } from '@/test/mocks/server'
import { renderWithProviders } from '@/test/utils'
import Jobs from './Jobs'

const mockNavigate = vi.fn()
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return { ...actual, useNavigate: () => mockNavigate }
})

describe('Jobs page', () => {
  it('shows loading state initially', () => {
    renderWithProviders(<Jobs />)
    expect(screen.getByText('Loading jobs…')).toBeInTheDocument()
  })

  it('renders job list after data loads', async () => {
    renderWithProviders(<Jobs />)
    await waitFor(() => expect(screen.getByText('Acme Corp')).toBeInTheDocument())
    expect(screen.getByText('Senior Engineer')).toBeInTheDocument()
  })

  it('shows score values for evaluated jobs', async () => {
    renderWithProviders(<Jobs />)
    await waitFor(() => expect(screen.getByText('Acme Corp')).toBeInTheDocument())
    // Score columns rendered as formatted numbers
    expect(screen.getByText('7.8')).toBeInTheDocument()
  })

  it('shows error state on failure', async () => {
    server.use(http.get('/api/v1/jobs', () => new HttpResponse(null, { status: 500 })))
    renderWithProviders(<Jobs />)
    await waitFor(() => expect(screen.getByText('Failed to load jobs.')).toBeInTheDocument())
  })

  it('shows empty state when no jobs exist', async () => {
    server.use(http.get('/api/v1/jobs', () => HttpResponse.json([])))
    renderWithProviders(<Jobs />)
    await waitFor(() => expect(screen.getByText(/No jobs yet/)).toBeInTheDocument())
  })

  it('shows remote type pill for remote jobs', async () => {
    renderWithProviders(<Jobs />)
    await waitFor(() => expect(screen.getByText('Remote')).toBeInTheDocument())
  })

  it('does not render a right-panel split-pane', async () => {
    renderWithProviders(<Jobs />)
    await waitFor(() => expect(screen.getByText('Acme Corp')).toBeInTheDocument())
    // No embedded job detail panel — verify split-pane is gone by checking
    // that "Job Description" section header (only in JobDetail right column) is absent
    expect(screen.queryByText('Job Description')).not.toBeInTheDocument()
  })

  it('navigates to /jobs/:id when a row is clicked', async () => {
    const user = userEvent.setup()
    mockNavigate.mockClear()
    renderWithProviders(<Jobs />)
    await waitFor(() => expect(screen.getByText('Acme Corp')).toBeInTheDocument())
    await user.click(screen.getByText('Acme Corp'))
    expect(mockNavigate).toHaveBeenCalledWith('/jobs/1')
  })
})
