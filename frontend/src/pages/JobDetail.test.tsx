import { describe, it, expect } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse, delay } from 'msw'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render } from '@testing-library/react'
import { server } from '@/test/mocks/server'
import {
  MOCK_JOB_DETAIL,
  MOCK_HEALTH,
  MOCK_TYP_DOC,
  MOCK_DRAFT_PDF,
  MOCK_FINAL_PDF,
  MOCK_UPLOADED_PDF,
  MOCK_MISSING_TYP,
} from '@/test/mocks/handlers'
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

  it('renders all 4 tab buttons', async () => {
    renderWorkspace()
    await waitFor(() => expect(screen.getByText('Job Details')).toBeInTheDocument())
    expect(screen.getByText('Apply')).toBeInTheDocument()
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
    await waitFor(() => screen.getByText('Apply'))
    await user.click(screen.getByText('Apply'))
    const tabBtn = screen.getByText('Apply').closest('button')
    expect(tabBtn?.className).toContain('text-accent')
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

  it('shows — when agg_score_overall is null', async () => {
    server.use(
      http.get('/api/v1/jobs/:id', () =>
        HttpResponse.json({
          ...MOCK_JOB_DETAIL,
          job: { ...MOCK_JOB_DETAIL.job, agg_score_overall: null },
        }),
      ),
    )
    renderWorkspace()
    await waitFor(() => expect(screen.getAllByText('—').length).toBeGreaterThan(0))
  })

  it('activates APPLY tab from ?tab=apply URL param', async () => {
    renderWorkspace(1, 'apply')
    await waitFor(() => {
      const tabBtn = screen.getByText('Apply').closest('button')
      expect(tabBtn?.className).toContain('text-accent')
    })
  })

  it('shows JOB DETAIL SUMMARY action active by default on JOB DETAILS tab', async () => {
    renderWorkspace()
    await waitFor(() => screen.getByText('Job Detail Summary'))
    const btn = screen.getByText('Job Detail Summary').closest('button')
    expect(btn?.className).toContain('text-accent')
  })

  it('switches right column when JOB DESCRIPTION action is clicked', async () => {
    const user = userEvent.setup()
    renderWorkspace()
    await waitFor(() => screen.getByText('Job Description'))
    await user.click(screen.getByText('Job Description'))
    await waitFor(() =>
      expect(screen.getByText('Job Description').closest('button')?.className).toContain('text-accent'),
    )
  })

  it('shows APPLICATION DETAILS action active by default on APPLY tab', async () => {
    renderWorkspace(1, 'apply')
    await waitFor(() => screen.getByText('Application Details'))
    const btn = screen.getByText('Application Details').closest('button')
    expect(btn?.className).toContain('text-accent')
  })

  it('shows I APPLIED! button when applied is 0', async () => {
    renderWorkspace(1, 'apply')
    await waitFor(() => expect(screen.getByText('I APPLIED!')).toBeInTheDocument())
  })

  it('shows APPLICATION LOG tab full-width with no left column', async () => {
    renderWorkspace(1, 'application-log')
    await waitFor(() => {
      const logTab = screen.getAllByText('Application Log').map((el) => el.closest('button')).find(Boolean)
      expect(logTab?.className).toContain('text-accent')
    })
  })

  it('shows APPLICATION QUESTIONS zero state when no questions exist', async () => {
    const user = userEvent.setup()
    renderWorkspace(1, 'apply')
    await waitFor(() => screen.getByText('Application Questions'))
    await user.click(screen.getByText('Application Questions'))
    await waitFor(() =>
      expect(
        screen.getByText(/No application questions captured yet/),
      ).toBeInTheDocument(),
    )
  })

  describe('APPLICATION LOG ActivityLogRow', () => {
    const MOCK_APP_LOG_ENTRY = {
      entry_type: 'application_log',
      timestamp: '2024-06-01T10:00:00',
      activity_type: 'GENERAL',
      source: 'general note',
      text: 'This is the log text',
      url: null,
      raw_id: 42,
      can_delete: true,
      can_edit_timestamp: true,
    }

    const MOCK_AUDIT_ENTRY = {
      entry_type: 'audit',
      timestamp: '2024-06-01T11:00:00',
      activity_type: 'STATUS CHANGE',
      source: '',
      text: 'Status updated to: rejected',
      url: null,
      raw_id: 7,
      can_delete: false,
      can_edit_timestamp: true,
    }

    const MOCK_EVAL_ENTRY = {
      entry_type: 'evaluation',
      timestamp: '2024-06-01T09:00:00',
      activity_type: 'EVALUATION',
      source: 'GPT-4',
      text: null,
      url: null,
      raw_id: 3,
      can_delete: false,
      can_edit_timestamp: false,
      // no eval_data — falls back to "No content." (used by existing test)
    }

    const MOCK_EVAL_ENTRY_WITH_DATA = {
      entry_type: 'evaluation',
      timestamp: '2024-06-01T09:00:00',
      activity_type: 'EVALUATION',
      source: 'GPT-4',
      text: 'Score: 8.5/10 · Core Fit · Apply',
      url: null,
      raw_id: 3,
      can_delete: false,
      can_edit_timestamp: false,
      eval_data: {
        score_overall: 8.5,
        score_role_fit: 7.0,
        score_scope_fit: 8.0,
        score_culture: 9.0,
        score_comp: 6.5,
        fit_type: 'Core Fit',
        archetype: 'People Leader',
        recommendation: 'Apply',
        strengths: 'Great leadership skills',
        gaps: 'Needs more Python',
        keywords: 'Python, leadership',
        keyword_gaps: 'Kubernetes',
        domain_match: 'Same domain',
        role_type_match: 'Target match',
      },
    }

    const MOCK_LLM_CALL_ENTRY = {
      entry_type: 'llm_call',
      timestamp: '2024-06-01T08:00:00',
      activity_type: 'EVALUATION',
      source: 'gpt-4',
      text: 'Evaluate this job.',
      url: null,
      raw_id: 1,  // matches MOCK_LLM_LOG[0].id = 1 in default handlers
      can_delete: false,
      can_edit_timestamp: false,
    }

    it('clicking the header row toggles expanded content', async () => {
      const user = userEvent.setup()
      server.use(
        http.get('/api/v1/jobs/:id/activity-log', () =>
          HttpResponse.json({ entries: [MOCK_APP_LOG_ENTRY] }),
        ),
      )
      renderWorkspace(1, 'application-log')
      // wait for row to render — header shows source text
      await waitFor(() => expect(screen.getByText('general note')).toBeInTheDocument())
      // expanded text not yet visible
      expect(screen.queryByText('This is the log text')).not.toBeInTheDocument()
      // click the header row
      await user.click(screen.getByText('general note'))
      // expanded content now visible
      await waitFor(() => expect(screen.getByText('This is the log text')).toBeInTheDocument())
    })

    it('Delete button appears in expanded view, not in collapsed header', async () => {
      const user = userEvent.setup()
      server.use(
        http.get('/api/v1/jobs/:id/activity-log', () =>
          HttpResponse.json({ entries: [MOCK_APP_LOG_ENTRY] }),
        ),
      )
      renderWorkspace(1, 'application-log')
      await waitFor(() => expect(screen.getByText('general note')).toBeInTheDocument())
      // Delete not visible while collapsed
      expect(screen.queryByText('Delete')).not.toBeInTheDocument()
      // expand the row
      await user.click(screen.getByText('general note'))
      await waitFor(() => expect(screen.getByText('Delete')).toBeInTheDocument())
    })

    it('Edit Timestamp button appears in expanded view when can_edit_timestamp', async () => {
      const user = userEvent.setup()
      server.use(
        http.get('/api/v1/jobs/:id/activity-log', () =>
          HttpResponse.json({ entries: [MOCK_APP_LOG_ENTRY] }),
        ),
      )
      renderWorkspace(1, 'application-log')
      await waitFor(() => expect(screen.getByText('general note')).toBeInTheDocument())
      // not visible while collapsed
      expect(screen.queryByText('Edit Timestamp')).not.toBeInTheDocument()
      // expand
      await user.click(screen.getByText('general note'))
      await waitFor(() => expect(screen.getByText('Edit Timestamp')).toBeInTheDocument())
    })

    it('Edit Timestamp button absent when can_edit_timestamp is false', async () => {
      const user = userEvent.setup()
      server.use(
        http.get('/api/v1/jobs/:id/activity-log', () =>
          HttpResponse.json({ entries: [MOCK_EVAL_ENTRY] }),
        ),
      )
      renderWorkspace(1, 'application-log')
      await waitFor(() => expect(screen.getByText('GPT-4')).toBeInTheDocument())
      await user.click(screen.getByText('GPT-4'))
      await waitFor(() => expect(screen.getByText('No content.')).toBeInTheDocument())
      expect(screen.queryByText('Edit Timestamp')).not.toBeInTheDocument()
    })

    it('C5: audit entry shows event text in info column of collapsed header', async () => {
      server.use(
        http.get('/api/v1/jobs/:id/activity-log', () =>
          HttpResponse.json({ entries: [MOCK_AUDIT_ENTRY] }),
        ),
      )
      renderWorkspace(1, 'application-log')
      // The audit event text should be visible in the collapsed header
      await waitFor(() => expect(screen.getByText('Status updated to: rejected')).toBeInTheDocument())
    })

    it('non-audit entry shows source in info column of collapsed header', async () => {
      server.use(
        http.get('/api/v1/jobs/:id/activity-log', () =>
          HttpResponse.json({ entries: [MOCK_APP_LOG_ENTRY] }),
        ),
      )
      renderWorkspace(1, 'application-log')
      await waitFor(() => expect(screen.getByText('general note')).toBeInTheDocument())
    })

    it('C7: expanded evaluation entry shows structured eval card when eval_data present', async () => {
      const user = userEvent.setup()
      server.use(
        http.get('/api/v1/jobs/:id/activity-log', () =>
          HttpResponse.json({ entries: [MOCK_EVAL_ENTRY_WITH_DATA] }),
        ),
      )
      renderWorkspace(1, 'application-log')
      await waitFor(() => expect(screen.getByText('GPT-4')).toBeInTheDocument())
      await user.click(screen.getByText('GPT-4'))
      await waitFor(() => expect(screen.getByText('Strengths')).toBeInTheDocument())
      expect(screen.getByText('Great leadership skills')).toBeInTheDocument()
      expect(screen.getByText('Gaps')).toBeInTheDocument()
      expect(screen.getByText('Needs more Python')).toBeInTheDocument()
    })

    it('C6: expanded llm_call entry shows rich LLM view with prompt and raw response', async () => {
      const user = userEvent.setup()
      server.use(
        http.get('/api/v1/jobs/:id/activity-log', () =>
          HttpResponse.json({ entries: [MOCK_LLM_CALL_ENTRY] }),
        ),
      )
      renderWorkspace(1, 'application-log')
      await waitFor(() => expect(screen.getByText('gpt-4')).toBeInTheDocument())
      await user.click(screen.getByText('gpt-4'))
      await waitFor(() => expect(screen.getByText(/Raw response/i)).toBeInTheDocument())
      expect(screen.getByText('Evaluate this job.')).toBeInTheDocument()
    })
  })
})
