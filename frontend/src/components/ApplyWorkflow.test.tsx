import { describe, it, expect, vi } from 'vitest'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithProviders } from '@/test/utils'
import { ApplyWorkflow } from './ApplyWorkflow'
import type { EvalWithMeta } from '@/types/api'

const BASE_PROPS = {
  jobId: 1,
  applicationId: 1,
  evaluations: [] as EvalWithMeta[],
  typstAvailable: true,
  onImportEval: vi.fn(),
  onNavigateToEvals: vi.fn(),
  onNavigateToResume: vi.fn(),
  onNavigateToResearch: vi.fn(),
}

const MOCK_EVAL: EvalWithMeta = {
  id: 1,
  job_id: 1,
  llm_model_id: 1,
  score_overall: 8,
  score_role_fit: 4,
  score_scope_fit: 4,
  score_culture: 3,
  score_comp: 4,
  fit_type: null,
  archetype: null,
  strengths: null,
  gaps: null,
  recommendation: null,
  keywords: null,
  domain_match: null,
  role_type_match: null,
  keyword_gaps: null,
  llm_call_log_id: null,
  evaluated_at: '2024-01-01T00:00:00',
  model_name: 'llama3',
  eval_source: 'local',
  prompt_version: 1,
  temperature: 0.3,
}

describe('ApplyWorkflow', () => {
  it('renders the evaluations summary block with all headers', () => {
    renderWithProviders(<ApplyWorkflow {...BASE_PROPS} />)
    expect(screen.getByText(/Count/i)).toBeInTheDocument()
    expect(screen.getByText(/Screenability/i)).toBeInTheDocument()
    expect(screen.getByText(/Company Fit/i)).toBeInTheDocument()
    expect(screen.getByText(/Candidate Fit/i)).toBeInTheDocument()
  })

  it('shows dash for count when no evaluations', () => {
    renderWithProviders(<ApplyWorkflow {...BASE_PROPS} />)
    const dashes = screen.getAllByText('—')
    expect(dashes.length).toBeGreaterThan(0)
  })

  it('shows evaluation count when evaluations provided', () => {
    renderWithProviders(<ApplyWorkflow {...BASE_PROPS} evaluations={[MOCK_EVAL]} />)
    expect(screen.getByText('1')).toBeInTheDocument()
  })

  it('renders evaluation action buttons', () => {
    renderWithProviders(<ApplyWorkflow {...BASE_PROPS} />)
    expect(screen.getByText('Re-Run Internal Eval')).toBeInTheDocument()
    expect(screen.getByText('Generate External Eval')).toBeInTheDocument()
    expect(screen.getByText('Import External Eval')).toBeInTheDocument()
  })

  it('renders Review Evaluations link', () => {
    renderWithProviders(<ApplyWorkflow {...BASE_PROPS} />)
    expect(screen.getByText('Review Evaluations →')).toBeInTheDocument()
  })

  it('renders Pass 1, 2, and 3 resume generation rows', () => {
    renderWithProviders(<ApplyWorkflow {...BASE_PROPS} />)
    expect(screen.getByText('Pass 1')).toBeInTheDocument()
    expect(screen.getByText('Pass 2')).toBeInTheDocument()
    expect(screen.getByText('Pass 3')).toBeInTheDocument()
  })

  it('renders Review Resumes link', () => {
    renderWithProviders(<ApplyWorkflow {...BASE_PROPS} />)
    expect(screen.getByText('Review Resumes →')).toBeInTheDocument()
  })

  it('calls onImportEval when Import External Eval is clicked', async () => {
    const onImportEval = vi.fn()
    renderWithProviders(<ApplyWorkflow {...BASE_PROPS} onImportEval={onImportEval} />)
    await userEvent.click(screen.getByText('Import External Eval'))
    expect(onImportEval).toHaveBeenCalled()
  })

  it('calls onNavigateToEvals when Review Evaluations is clicked', async () => {
    const onNavigateToEvals = vi.fn()
    renderWithProviders(<ApplyWorkflow {...BASE_PROPS} onNavigateToEvals={onNavigateToEvals} />)
    await userEvent.click(screen.getByText('Review Evaluations →'))
    expect(onNavigateToEvals).toHaveBeenCalled()
  })

  it('calls onNavigateToResume when Review Resumes is clicked', async () => {
    const onNavigateToResume = vi.fn()
    renderWithProviders(<ApplyWorkflow {...BASE_PROPS} onNavigateToResume={onNavigateToResume} />)
    await userEvent.click(screen.getByText('Review Resumes →'))
    expect(onNavigateToResume).toHaveBeenCalled()
  })

  it('renders Step 1 — Research block', () => {
    renderWithProviders(<ApplyWorkflow {...BASE_PROPS} />)
    expect(screen.getByText(/Step 1.*Research/i)).toBeInTheDocument()
  })

  it('renders Generate Research Prompt button in Step 1', () => {
    renderWithProviders(<ApplyWorkflow {...BASE_PROPS} />)
    expect(screen.getByText('Generate Research Prompt')).toBeInTheDocument()
  })

  it('renders View Research link in Step 1', () => {
    renderWithProviders(<ApplyWorkflow {...BASE_PROPS} />)
    expect(screen.getByText('View Research →')).toBeInTheDocument()
  })

  it('calls onNavigateToResearch when View Research is clicked', async () => {
    const onNavigateToResearch = vi.fn()
    renderWithProviders(<ApplyWorkflow {...BASE_PROPS} onNavigateToResearch={onNavigateToResearch} />)
    await userEvent.click(screen.getByText('View Research →'))
    expect(onNavigateToResearch).toHaveBeenCalled()
  })
})
