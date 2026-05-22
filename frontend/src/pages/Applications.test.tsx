import { describe, it, expect, vi } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { server } from '@/test/mocks/server'
import { renderWithProviders } from '@/test/utils'
import Applications from './Applications'

const mockNavigate = vi.fn()
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return { ...actual, useNavigate: () => mockNavigate }
})

describe('Applications page', () => {
  it('shows loading state initially', () => {
    renderWithProviders(<Applications />)
    expect(screen.getByText('Loading applications…')).toBeInTheDocument()
  })

  it('renders application list after data loads', async () => {
    renderWithProviders(<Applications />)
    await waitFor(() => expect(screen.getByText('Acme Corp')).toBeInTheDocument())
    expect(screen.getByText('Senior Engineer')).toBeInTheDocument()
  })

  it('shows application status pill', async () => {
    renderWithProviders(<Applications />)
    await waitFor(() => expect(screen.getByText('applied')).toBeInTheDocument())
  })

  it('shows error state on failure', async () => {
    server.use(http.get('/api/v1/applications', () => new HttpResponse(null, { status: 500 })))
    renderWithProviders(<Applications />)
    await waitFor(() => expect(screen.getByText('Failed to load applications.')).toBeInTheDocument())
  })

  it('shows empty state when no applications exist', async () => {
    server.use(http.get('/api/v1/applications', () => HttpResponse.json([])))
    renderWithProviders(<Applications />)
    await waitFor(() =>
      expect(screen.getByText(/No active applications yet/)).toBeInTheDocument(),
    )
  })

  it('does not render a right-panel split-pane', async () => {
    renderWithProviders(<Applications />)
    await waitFor(() => expect(screen.getByText('Acme Corp')).toBeInTheDocument())
    // ApplicationSummary right panel is retired — verify it is absent
    expect(screen.queryByText('Application Details')).not.toBeInTheDocument()
  })

  it('navigates to /jobs/:id?tab=application when a row is clicked', async () => {
    const user = userEvent.setup()
    mockNavigate.mockClear()
    renderWithProviders(<Applications />)
    await waitFor(() => expect(screen.getByText('Acme Corp')).toBeInTheDocument())
    await user.click(screen.getByText('Acme Corp'))
    expect(mockNavigate).toHaveBeenCalledWith('/jobs/1?tab=application')
  })
})
