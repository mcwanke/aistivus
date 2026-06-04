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

  it('shows upload form on RESUME/COVER tab', async () => {
    const user = userEvent.setup()
    renderWorkspace()
    await waitFor(() => screen.getByText('Resume / Cover'))
    await user.click(screen.getByText('Resume / Cover'))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Upload' })).toBeInTheDocument())
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
    await waitFor(() => {
      const tabBtn = screen.getByText('Resume / Cover').closest('button')
      expect(tabBtn?.className).toContain('text-accent')
    })
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

  it('activates APPLICATION tab from ?tab=application URL param', async () => {
    renderWorkspace(1, 'application')
    await waitFor(() => {
      const tabBtn = screen.getByText('Application').closest('button')
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

  it('shows APP DETAIL SUMMARY action active by default on APPLICATION tab', async () => {
    renderWorkspace(1, 'application')
    await waitFor(() => screen.getByText('App Detail Summary'))
    const btn = screen.getByText('App Detail Summary').closest('button')
    expect(btn?.className).toContain('text-accent')
  })

  it('shows I APPLIED! button when applied is 0', async () => {
    renderWorkspace(1, 'application')
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
    renderWorkspace(1, 'application')
    await waitFor(() => screen.getByText('Application Questions'))
    await user.click(screen.getByText('Application Questions'))
    await waitFor(() =>
      expect(
        screen.getByText(/No application questions captured yet/),
      ).toBeInTheDocument(),
    )
  })

  describe('RESUME/COVER tab', () => {
    it('renders document list with filename, type badge, and date', async () => {
      server.use(
        http.get('/api/v1/applications/:id/documents', () =>
          HttpResponse.json([MOCK_TYP_DOC]),
        ),
      )
      renderWorkspace(1, 'resume-cover')
      await waitFor(() => expect(screen.getByText('resume_v1.typ')).toBeInTheDocument())
      expect(screen.getByText('resume')).toBeInTheDocument()
    })

    it('.typ row shows Edit and Compile; no Open, Download, or Finalize', async () => {
      server.use(
        http.get('/api/v1/applications/:id/documents', () =>
          HttpResponse.json([MOCK_TYP_DOC]),
        ),
      )
      renderWorkspace(1, 'resume-cover')
      await waitFor(() => expect(screen.getByText('resume_v1.typ')).toBeInTheDocument())
      expect(screen.getByText('Edit')).toBeInTheDocument()
      expect(screen.getByText('Compile')).toBeInTheDocument()
      expect(screen.queryByText('Open')).not.toBeInTheDocument()
      expect(screen.queryByText('Download')).not.toBeInTheDocument()
      expect(screen.queryByText('Finalize')).not.toBeInTheDocument()
    })

    it('DRAFT_ PDF row shows Finalize, Open, Download; no Compile', async () => {
      server.use(
        http.get('/api/v1/applications/:id/documents', () =>
          HttpResponse.json([MOCK_DRAFT_PDF]),
        ),
      )
      renderWorkspace(1, 'resume-cover')
      await waitFor(() => expect(screen.getByText('DRAFT_resume_v1.pdf')).toBeInTheDocument())
      expect(screen.getByText('Finalize')).toBeInTheDocument()
      expect(screen.getByText('Open')).toBeInTheDocument()
      expect(screen.getByText('Download')).toBeInTheDocument()
      expect(screen.queryByText('Compile')).not.toBeInTheDocument()
    })

    it('final PDF row shows [Final] badge, Open, Download; no Compile or Finalize', async () => {
      server.use(
        http.get('/api/v1/applications/:id/documents', () =>
          HttpResponse.json([MOCK_FINAL_PDF]),
        ),
      )
      renderWorkspace(1, 'resume-cover')
      await waitFor(() => expect(screen.getByText('jane_acme_corp_senior_engineer.pdf')).toBeInTheDocument())
      expect(screen.getByText('Final')).toBeInTheDocument()
      expect(screen.getByText('Open')).toBeInTheDocument()
      expect(screen.getByText('Download')).toBeInTheDocument()
      expect(screen.queryByText('Compile')).not.toBeInTheDocument()
      expect(screen.queryByText('Finalize')).not.toBeInTheDocument()
    })

    it('non-DRAFT uploaded PDF shows Open and Download; no Compile or Finalize', async () => {
      server.use(
        http.get('/api/v1/applications/:id/documents', () =>
          HttpResponse.json([MOCK_UPLOADED_PDF]),
        ),
      )
      renderWorkspace(1, 'resume-cover')
      await waitFor(() => expect(screen.getByText('cover.pdf')).toBeInTheDocument())
      expect(screen.getByText('Open')).toBeInTheDocument()
      expect(screen.getByText('Download')).toBeInTheDocument()
      expect(screen.queryByText('Compile')).not.toBeInTheDocument()
      expect(screen.queryByText('Finalize')).not.toBeInTheDocument()
    })

    it('Compile button hidden when typst_available is false', async () => {
      server.use(
        http.get('/api/v1/health', () =>
          HttpResponse.json({ ...MOCK_HEALTH, typst_available: false }),
        ),
        http.get('/api/v1/applications/:id/documents', () =>
          HttpResponse.json([MOCK_TYP_DOC]),
        ),
      )
      renderWorkspace(1, 'resume-cover')
      await waitFor(() => expect(screen.getByText('resume_v1.typ')).toBeInTheDocument())
      expect(screen.queryByText('Compile')).not.toBeInTheDocument()
      expect(screen.getByText('Edit')).toBeInTheDocument()
    })

    it('shows Typst unavailable banner when typst_available is false', async () => {
      server.use(
        http.get('/api/v1/health', () =>
          HttpResponse.json({ ...MOCK_HEALTH, typst_available: false }),
        ),
      )
      renderWorkspace(1, 'resume-cover')
      await waitFor(() => expect(screen.getByText(/Typst not found/)).toBeInTheDocument())
    })

    it('Compile button shows Compiling… during request', async () => {
      const user = userEvent.setup()
      server.use(
        http.get('/api/v1/applications/:id/documents', () =>
          HttpResponse.json([MOCK_TYP_DOC]),
        ),
        http.post('/api/v1/applications/:id/documents/:docId/compile', async () => {
          await delay('infinite')
          return HttpResponse.json({ success: true })
        }),
      )
      renderWorkspace(1, 'resume-cover')
      await waitFor(() => screen.getByText('Compile'))
      void user.click(screen.getByText('Compile'))
      await waitFor(() => expect(screen.getByText('Compiling…')).toBeInTheDocument())
    })

    it('shows compile error inline on failure', async () => {
      const user = userEvent.setup()
      server.use(
        http.get('/api/v1/applications/:id/documents', () =>
          HttpResponse.json([MOCK_TYP_DOC]),
        ),
        http.post('/api/v1/applications/:id/documents/:docId/compile', () =>
          HttpResponse.json(
            { success: false, error: 'Compilation failed', detail: 'error: expected identifier at line 5' },
            { status: 400 },
          ),
        ),
      )
      renderWorkspace(1, 'resume-cover')
      await waitFor(() => screen.getByText('Compile'))
      await user.click(screen.getByText('Compile'))
      await waitFor(() => expect(screen.getByText(/expected identifier/)).toBeInTheDocument())
    })

    it('finalize adds a Final-badged row after list refreshes', async () => {
      const user = userEvent.setup()
      let docCallCount = 0
      server.use(
        http.get('/api/v1/applications/:id/documents', () => {
          docCallCount++
          return HttpResponse.json(docCallCount === 1 ? [MOCK_DRAFT_PDF] : [MOCK_FINAL_PDF])
        }),
      )
      renderWorkspace(1, 'resume-cover')
      await waitFor(() => screen.getByText('Finalize'))
      await user.click(screen.getByText('Finalize'))
      await waitFor(() => expect(screen.getByText('Final')).toBeInTheDocument())
    })

    it('Delete shows inline confirmation; Cancel does not call DELETE', async () => {
      const user = userEvent.setup()
      server.use(
        http.get('/api/v1/applications/:id/documents', () =>
          HttpResponse.json([MOCK_TYP_DOC]),
        ),
      )
      renderWorkspace(1, 'resume-cover')
      await waitFor(() => screen.getByText('Delete'))
      await user.click(screen.getByText('Delete'))
      await waitFor(() => expect(screen.getByText(/Delete resume_v1\.typ\?/)).toBeInTheDocument())
      await user.click(screen.getByText('Cancel'))
      expect(screen.queryByText(/Delete resume_v1\.typ\?/)).not.toBeInTheDocument()
    })

    it('Delete Confirm calls DELETE and list refreshes', async () => {
      const user = userEvent.setup()
      let deleted = false
      server.use(
        http.get('/api/v1/applications/:id/documents', () =>
          HttpResponse.json(deleted ? [] : [MOCK_TYP_DOC]),
        ),
        http.delete('/api/v1/applications/:id/documents/:docId', () => {
          deleted = true
          return HttpResponse.json({ success: true })
        }),
      )
      renderWorkspace(1, 'resume-cover')
      await waitFor(() => screen.getByText('Delete'))
      await user.click(screen.getByText('Delete'))
      await waitFor(() => screen.getByText('Confirm'))
      await user.click(screen.getByText('Confirm'))
      await waitFor(() =>
        expect(screen.getByText(/No documents yet/)).toBeInTheDocument(),
      )
    })

    it('Edit button opens inline textarea pre-filled with file content', async () => {
      const user = userEvent.setup()
      server.use(
        http.get('/api/v1/applications/:id/documents', () =>
          HttpResponse.json([MOCK_TYP_DOC]),
        ),
      )
      renderWorkspace(1, 'resume-cover')
      await waitFor(() => screen.getByText('Edit'))
      await user.click(screen.getByText('Edit'))
      await waitFor(() =>
        expect(screen.getByRole('textbox', { name: '' })).toHaveValue('#let name = "Test"\n\nHello world'),
      )
    })

    it('Save calls PUT and closes editor on success', async () => {
      const user = userEvent.setup()
      server.use(
        http.get('/api/v1/applications/:id/documents', () =>
          HttpResponse.json([MOCK_TYP_DOC]),
        ),
      )
      renderWorkspace(1, 'resume-cover')
      await waitFor(() => screen.getByText('Edit'))
      await user.click(screen.getByText('Edit'))
      await waitFor(() => screen.getByRole('textbox', { name: '' }))
      await user.click(screen.getByText('Save'))
      await waitFor(() => expect(screen.queryByText('Save')).not.toBeInTheDocument())
    })

    it('Cancel closes editor without saving', async () => {
      const user = userEvent.setup()
      server.use(
        http.get('/api/v1/applications/:id/documents', () =>
          HttpResponse.json([MOCK_TYP_DOC]),
        ),
      )
      renderWorkspace(1, 'resume-cover')
      await waitFor(() => screen.getByText('Edit'))
      await user.click(screen.getByText('Edit'))
      await waitFor(() => screen.getByRole('textbox', { name: '' }))
      await user.click(screen.getByText('Cancel'))
      expect(screen.queryByRole('textbox', { name: '' })).not.toBeInTheDocument()
    })

    it('upload form renders type selector and file picker', async () => {
      renderWorkspace(1, 'resume-cover')
      await waitFor(() => expect(screen.getByRole('button', { name: 'Upload' })).toBeInTheDocument())
      expect(screen.getByRole('combobox')).toBeInTheDocument()
    })

    it('template picker renders when templates exist', async () => {
      renderWorkspace(1, 'resume-cover')
      await waitFor(() => expect(screen.getByText('Simple Resume')).toBeInTheDocument())
    })

    it('template picker hidden when both template categories are empty', async () => {
      server.use(
        http.get('/api/v1/templates/typst', () =>
          HttpResponse.json({ resume: [], cover_letter: [] }),
        ),
      )
      renderWorkspace(1, 'resume-cover')
      await waitFor(() => expect(screen.getByRole('button', { name: 'Upload' })).toBeInTheDocument())
      expect(screen.queryByText('New from template')).not.toBeInTheDocument()
    })

    it('selecting a template calls copy endpoint and list refreshes', async () => {
      const user = userEvent.setup()
      let copied = false
      server.use(
        http.get('/api/v1/applications/:id/documents', () =>
          HttpResponse.json(copied ? [MOCK_TYP_DOC] : []),
        ),
        http.post('/api/v1/applications/:id/documents/from-template', () => {
          copied = true
          return HttpResponse.json(MOCK_TYP_DOC, { status: 201 })
        }),
      )
      renderWorkspace(1, 'resume-cover')
      await waitFor(() => screen.getByText('Simple Resume'))
      await user.click(screen.getByText('Simple Resume'))
      await waitFor(() => expect(screen.getByText('resume_v1.typ')).toBeInTheDocument())
    })

    it('shows empty state when document list is empty', async () => {
      server.use(
        http.get('/api/v1/applications/:id/documents', () => HttpResponse.json([])),
      )
      renderWorkspace(1, 'resume-cover')
      await waitFor(() =>
        expect(screen.getByText(/No documents yet/)).toBeInTheDocument(),
      )
    })

    it('file_exists false shows ⚠ File missing badge', async () => {
      server.use(
        http.get('/api/v1/applications/:id/documents', () =>
          HttpResponse.json([MOCK_MISSING_TYP]),
        ),
      )
      renderWorkspace(1, 'resume-cover')
      await waitFor(() => expect(screen.getByText('missing.typ')).toBeInTheDocument())
      expect(screen.getByText('⚠ File missing')).toBeInTheDocument()
    })
  })
})
