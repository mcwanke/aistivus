import { describe, it, expect, vi } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { server } from '@/test/mocks/server'
import { renderWithProviders } from '@/test/utils'
import { MOCK_APPLICATION } from '@/test/mocks/handlers'
import Applications from './Applications'

const mockNavigate = vi.fn()
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return { ...actual, useNavigate: () => mockNavigate }
})

describe('Applications page', () => {
  it('shows loading state initially', () => {
    renderWithProviders(<Applications />)
    expect(screen.getByText('Loading…')).toBeInTheDocument()
  })

  it('renders job list after data loads', async () => {
    renderWithProviders(<Applications />)
    await waitFor(() => expect(screen.getByText('Acme Corp')).toBeInTheDocument())
    expect(screen.getByText('Senior Engineer')).toBeInTheDocument()
  })

  it('shows application status pill', async () => {
    renderWithProviders(<Applications />)
    await waitFor(() => expect(screen.getAllByText('applied').length).toBeGreaterThan(0))
  })

  it('shows error state on failure', async () => {
    server.use(http.get('/api/v1/applications', () => new HttpResponse(null, { status: 500 })))
    renderWithProviders(<Applications />)
    await waitFor(() => expect(screen.getByText('Failed to load jobs.')).toBeInTheDocument())
  })

  it('shows empty state when all filtered out', async () => {
    server.use(http.get('/api/v1/applications', () => HttpResponse.json([])))
    renderWithProviders(<Applications />)
    await waitFor(() =>
      expect(screen.getByText('No jobs match the current filters.')).toBeInTheDocument(),
    )
  })

  it('shows N of M header count', async () => {
    renderWithProviders(<Applications />)
    await waitFor(() => expect(screen.getByText('1 of 1 jobs')).toBeInTheDocument())
  })

  it('renders all status filter pills', async () => {
    renderWithProviders(<Applications />)
    await waitFor(() => expect(screen.getByText('Acme Corp')).toBeInTheDocument())
    expect(screen.getByText('not-started')).toBeInTheDocument()
    expect(screen.getByText('interview')).toBeInTheDocument()
    expect(screen.getByText('withdrawn')).toBeInTheDocument()
  })

  it('toggling a status pill hides matching rows', async () => {
    const user = userEvent.setup()
    renderWithProviders(<Applications />)
    await waitFor(() => expect(screen.getByText('Acme Corp')).toBeInTheDocument())
    // MOCK_APPLICATION has status 'applied' — toggle it off
    const appliedPills = screen.getAllByText('applied')
    // the pill in the filter bar is the first one
    await user.click(appliedPills[0]!)
    await waitFor(() => expect(screen.queryByText('Acme Corp')).not.toBeInTheDocument())
    expect(screen.getByText('0 of 1 jobs')).toBeInTheDocument()
  })

  it('checkbox selects the job and enables Re-run button', async () => {
    const user = userEvent.setup()
    renderWithProviders(<Applications />)
    await waitFor(() => expect(screen.getByText('Acme Corp')).toBeInTheDocument())

    const rerunBtn = screen.getByRole('button', { name: 'Re-run Evals' })
    expect(rerunBtn).toBeDisabled()

    const checkboxes = screen.getAllByRole('checkbox')
    // first checkbox is "select all", subsequent are row checkboxes
    await user.click(checkboxes[1]!)
    expect(rerunBtn).not.toBeDisabled()
    expect(screen.getByText('1 selected')).toBeInTheDocument()
  })

  it('select-all checkbox selects all visible rows', async () => {
    const user = userEvent.setup()
    server.use(
      http.get('/api/v1/applications', () =>
        HttpResponse.json([
          MOCK_APPLICATION,
          { ...MOCK_APPLICATION, id: 2, job_id: 2, company_name: 'Beta Corp' },
        ])
      ),
    )
    renderWithProviders(<Applications />)
    await waitFor(() => expect(screen.getByText('Beta Corp')).toBeInTheDocument())

    const selectAll = screen.getAllByRole('checkbox')[0]!
    await user.click(selectAll)
    expect(screen.getByText('2 selected')).toBeInTheDocument()
  })

  it('row body click navigates to job detail', async () => {
    const user = userEvent.setup()
    mockNavigate.mockClear()
    renderWithProviders(<Applications />)
    await waitFor(() => expect(screen.getByText('Acme Corp')).toBeInTheDocument())
    await user.click(screen.getByText('Acme Corp'))
    expect(mockNavigate).toHaveBeenCalledWith('/jobs/1?tab=application')
  })

  it('checkbox click does not navigate', async () => {
    const user = userEvent.setup()
    mockNavigate.mockClear()
    renderWithProviders(<Applications />)
    await waitFor(() => expect(screen.getByText('Acme Corp')).toBeInTheDocument())
    const checkboxes = screen.getAllByRole('checkbox')
    await user.click(checkboxes[1]!)
    expect(mockNavigate).not.toHaveBeenCalled()
  })
})
