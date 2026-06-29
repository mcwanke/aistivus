import { describe, it, expect } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { server } from '@/test/mocks/server'
import { renderWithProviders } from '@/test/utils'
import { ResearchSubpage } from './ResearchSubpage'
import type { JobResearch } from '@/types/api'

const MOCK_RESEARCH: JobResearch = {
  id: 1,
  job_id: 1,
  raw_json: '{}',
  research_summary: 'Strong Series B company in the payments space.',
  research_confidence: 'high',
  company_overview: 'A fintech startup founded in 2018.',
  company_stage: 'Series B',
  company_size_actual: '200-500',
  company_trajectory: null,
  company_culture_overview: null,
  culture_signals: null,
  comp_signals: null,
  role_context: null,
  interview_process: null,
  red_flags: null,
  green_flags: null,
  research_notes: null,
  imported_at: '2024-06-01T00:00:00',
}

describe('ResearchSubpage — empty state', () => {
  it('renders "Generate Research Prompt" button', async () => {
    renderWithProviders(<ResearchSubpage jobId={1} />)
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /Generate Research Prompt/i })).toBeInTheDocument()
    )
  })

  it('renders "Import Research Results" button', async () => {
    renderWithProviders(<ResearchSubpage jobId={1} />)
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /Import Research Results/i })).toBeInTheDocument()
    )
  })

  it('shows empty state message when no research data', async () => {
    renderWithProviders(<ResearchSubpage jobId={1} />)
    await waitFor(() =>
      expect(screen.getByText(/No research data yet/i)).toBeInTheDocument()
    )
  })
})

describe('ResearchSubpage — with research data', () => {
  it('renders research summary when data is loaded', async () => {
    server.use(
      http.get('/api/v1/jobs/:id/research', () =>
        HttpResponse.json({ research: MOCK_RESEARCH }),
      ),
    )
    renderWithProviders(<ResearchSubpage jobId={1} />)
    await waitFor(() =>
      expect(
        screen.getByText('Strong Series B company in the payments space.')
      ).toBeInTheDocument()
    )
  })

  it('shows research confidence badge', async () => {
    server.use(
      http.get('/api/v1/jobs/:id/research', () =>
        HttpResponse.json({ research: MOCK_RESEARCH }),
      ),
    )
    renderWithProviders(<ResearchSubpage jobId={1} />)
    await waitFor(() => expect(screen.getByText('high')).toBeInTheDocument())
  })

  it('shows company stage field', async () => {
    server.use(
      http.get('/api/v1/jobs/:id/research', () =>
        HttpResponse.json({ research: MOCK_RESEARCH }),
      ),
    )
    renderWithProviders(<ResearchSubpage jobId={1} />)
    await waitFor(() => expect(screen.getByText('Series B')).toBeInTheDocument())
  })
})

describe('ResearchSubpage — import modal', () => {
  it('import modal opens on button click', async () => {
    const user = userEvent.setup()
    renderWithProviders(<ResearchSubpage jobId={1} />)
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /Import Research Results/i })).toBeInTheDocument()
    )
    await user.click(screen.getByRole('button', { name: /Import Research Results/i }))
    // 'Parse & Import' is unique to the modal; button text appears in both button and modal header
    await waitFor(() =>
      expect(screen.getByText('Parse & Import')).toBeInTheDocument()
    )
  })

})
