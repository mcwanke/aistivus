import { describe, it, expect } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render } from '@testing-library/react'
import { server } from '@/test/mocks/server'
import JobDetailPage from './JobDetail'

function renderWorkspace(jobId = 1, tab?: string): void {
  const path = tab ? `/jobs/${jobId}?tab=${tab}` : `/jobs/${jobId}`
  const router = createMemoryRouter(
    [{ path: '/jobs/:jobId', element: <JobDetailPage /> }],
    { initialEntries: [path] },
  )
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
  })
  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
}

describe('JobDetailPage workspace', () => {
  it('shows loading state initially', () => {
    renderWorkspace()
    expect(screen.getByText('Loading…')).toBeInTheDocument()
  })

  it('shows error state when job not found', async () => {
    server.use(http.get('/api/v1/jobs/:id', () => new HttpResponse(null, { status: 404 })))
    renderWorkspace()
    await waitFor(() => expect(screen.getByText('Job not found.')).toBeInTheDocument())
  })

  it('renders job title after data loads', async () => {
    renderWorkspace()
    await waitFor(() => expect(screen.getAllByText('Senior Engineer').length).toBeGreaterThan(0))
  })

  it('renders company name in sub-header', async () => {
    renderWorkspace()
    await waitFor(() => expect(screen.getAllByText('Acme Corp').length).toBeGreaterThan(0))
  })

  it('renders location in sub-header', async () => {
    renderWorkspace()
    await waitFor(() => expect(screen.getByText(/📍/)).toBeInTheDocument())
  })

  it('renders all 5 tab buttons', async () => {
    renderWorkspace()
    await waitFor(() => expect(screen.getByText('Job Details')).toBeInTheDocument())
    expect(screen.getByText('Application')).toBeInTheDocument()
    expect(screen.getByText('Resume / Cover')).toBeInTheDocument()
    expect(screen.getByText('Interview')).toBeInTheDocument()
    expect(screen.getByText('Application Log')).toBeInTheDocument()
  })

  it('defaults to job-details tab with JOB DETAILS active', async () => {
    renderWorkspace()
    await waitFor(() => screen.getByText('Job Details'))
    // JOB DETAILS tab button should have accent styling
    const tabBtn = screen.getByText('Job Details').closest('button')
    expect(tabBtn?.className).toContain('text-accent')
  })

  it('activates tab on click', async () => {
    const user = userEvent.setup()
    renderWorkspace()
    await waitFor(() => screen.getByText('Resume / Cover'))
    await user.click(screen.getByText('Resume / Cover'))
    const tabBtn = screen.getByText('Resume / Cover').closest('button')
    expect(tabBtn?.className).toContain('text-accent')
  })

  it('shows RESUME/COVER stub card when that tab is active', async () => {
    const user = userEvent.setup()
    renderWorkspace()
    await waitFor(() => screen.getByText('Resume / Cover'))
    await user.click(screen.getByText('Resume / Cover'))
    await waitFor(() =>
      expect(screen.getByText('Resume & Cover Letter')).toBeInTheDocument(),
    )
    expect(screen.getByText(/Coming in Phase 1.6/)).toBeInTheDocument()
  })

  it('shows INTERVIEW stub card when that tab is active', async () => {
    const user = userEvent.setup()
    renderWorkspace()
    await waitFor(() => screen.getByText('Interview'))
    // Click the tab button (not any other element with "Interview" text)
    const tabs = screen.getAllByText('Interview')
    await user.click(tabs[0])
    await waitFor(() =>
      expect(screen.getByText('Interview Tracking')).toBeInTheDocument(),
    )
    expect(screen.getByText(/Coming soon/)).toBeInTheDocument()
  })

  it('opens RESUME/COVER tab when ?tab=resume-cover in URL', async () => {
    renderWorkspace(1, 'resume-cover')
    await waitFor(() =>
      expect(screen.getByText('Resume & Cover Letter')).toBeInTheDocument(),
    )
  })

  it('opens APPLICATION LOG tab when ?tab=application-log in URL', async () => {
    renderWorkspace(1, 'application-log')
    await waitFor(() => {
      // tab button is one of multiple "Application Log" elements — find the one inside a button
      const logTab = screen.getAllByText('Application Log').map((el) => el.closest('button')).find(Boolean)
      expect(logTab?.className).toContain('text-accent')
    })
  })

  it('renders score in sub-header', async () => {
    renderWorkspace()
    await waitFor(() => expect(screen.getByText('/ 10')).toBeInTheDocument())
  })
})
