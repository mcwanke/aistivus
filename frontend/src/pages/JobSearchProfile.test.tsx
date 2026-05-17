import { describe, it, expect } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { server } from '@/test/mocks/server'
import { renderWithProviders } from '@/test/utils'
import {
  MOCK_PROFILE_HEALTH,
  MOCK_PROPOSED_UPDATE,
} from '@/test/mocks/handlers'
import JobSearchProfile from './JobSearchProfile'

describe('JobSearchProfile', () => {
  it('shows loading state initially', () => {
    renderWithProviders(<JobSearchProfile />)
    expect(screen.getByText('Loading sections…')).toBeInTheDocument()
  })

  it('renders all section names after data loads', async () => {
    renderWithProviders(<JobSearchProfile />)
    await waitFor(() => expect(screen.getByText('Who I Am')).toBeInTheDocument())
    expect(screen.getByText('Career Narrative')).toBeInTheDocument()
    expect(screen.getByText('Career History')).toBeInTheDocument()
    expect(screen.getByText('Skills & Strengths')).toBeInTheDocument()
    expect(screen.getByText('Target Role Profile')).toBeInTheDocument()
    expect(screen.getByText('Resume Master Copy')).toBeInTheDocument()
    expect(screen.getByText('Tailoring Rules')).toBeInTheDocument()
    expect(screen.getByText('Insights & Lessons')).toBeInTheDocument()
    expect(screen.getByText('Model Behavior Rules')).toBeInTheDocument()
  })

  it('shows correct status badges based on completion data', async () => {
    renderWithProviders(<JobSearchProfile />)
    await waitFor(() => expect(screen.getByText('Who I Am')).toBeInTheDocument())

    // Two complete sections (who_i_am and career_narrative)
    const completeBadges = screen.getAllByText('Complete')
    expect(completeBadges.length).toBeGreaterThanOrEqual(2)

    // Empty sections show Empty badge
    const emptyBadges = screen.getAllByText('Empty')
    expect(emptyBadges.length).toBeGreaterThanOrEqual(1)
  })

  it('shows profile strength count from health data', async () => {
    renderWithProviders(<JobSearchProfile />)
    await waitFor(() =>
      expect(
        screen.getByText(`${MOCK_PROFILE_HEALTH.completed_sections} of ${MOCK_PROFILE_HEALTH.total_sections} sections complete`),
      ).toBeInTheDocument(),
    )
  })

  it('shows idle state in right panel before any section is activated', async () => {
    renderWithProviders(<JobSearchProfile />)
    await waitFor(() => expect(screen.getByText('Who I Am')).toBeInTheDocument())
    expect(screen.getByText('Select a section on the left to edit with AI.')).toBeInTheDocument()
  })

  it('activates right panel when "Edit with AI" is clicked', async () => {
    const user = userEvent.setup()
    renderWithProviders(<JobSearchProfile />)
    await waitFor(() => expect(screen.getByText('Career Narrative')).toBeInTheDocument())

    // Expand the Career Narrative card first (collapsed by default)
    const careerNarrativeHeader = screen.getByText('Career Narrative').closest('div')!
    await user.click(careerNarrativeHeader)

    // "Edit with AI →" button should now be visible; click it
    const editBtn = await screen.findByRole('button', { name: /edit with ai/i })
    await user.click(editBtn)

    // Right panel should now show the section name as its header
    const panelHeaders = screen.getAllByText('Career Narrative')
    expect(panelHeaders.length).toBeGreaterThanOrEqual(2)

    // Idle state message should be gone
    expect(screen.queryByText('Select a section on the left to edit with AI.')).not.toBeInTheDocument()
  })

  it('mode toggle switches the active mode highlight', async () => {
    const user = userEvent.setup()
    renderWithProviders(<JobSearchProfile />)
    await waitFor(() => expect(screen.getByText('Career Narrative')).toBeInTheDocument())

    // Expand and activate Career Narrative (default mode: socratic)
    await user.click(screen.getByText('Career Narrative').closest('div')!)
    await user.click(await screen.findByRole('button', { name: /edit with ai/i }))

    // Wait for chat panel to appear
    await screen.findByRole('button', { name: /socratic/i })

    // Click Directive
    await user.click(screen.getByRole('button', { name: /directive/i }))

    // The Directive button should now have the active styling class (bg-bg)
    const directiveBtn = screen.getByRole('button', { name: /directive/i })
    expect(directiveBtn.className).toContain('bg-bg')

    // The Socratic button should no longer be active
    const socraticBtn = screen.getByRole('button', { name: /socratic/i })
    expect(socraticBtn.className).not.toContain('bg-bg')
  })

  it('shows no "Edit with AI" button for edit_only sections', async () => {
    const user = userEvent.setup()
    renderWithProviders(<JobSearchProfile />)
    await waitFor(() => expect(screen.getByText('Model Behavior Rules')).toBeInTheDocument())

    // Expand Model Behavior Rules
    await user.click(screen.getByText('Model Behavior Rules').closest('div')!)

    // No "Edit with AI" button should appear
    await waitFor(() => {
      const btns = screen.queryAllByRole('button', { name: /edit with ai/i })
      expect(btns.length).toBe(0)
    })
  })

  it('shows "Generate Rules" button for tailoring_rules section', async () => {
    const user = userEvent.setup()
    renderWithProviders(<JobSearchProfile />)
    await waitFor(() => expect(screen.getByText('Tailoring Rules')).toBeInTheDocument())

    await user.click(screen.getByText('Tailoring Rules').closest('div')!)

    expect(await screen.findByRole('button', { name: /generate rules/i })).toBeInTheDocument()
  })

  it('shows "Synthesize from Logs" button for insights_lessons section', async () => {
    const user = userEvent.setup()
    renderWithProviders(<JobSearchProfile />)
    await waitFor(() => expect(screen.getByText('Insights & Lessons')).toBeInTheDocument())

    await user.click(screen.getByText('Insights & Lessons').closest('div')!)

    expect(await screen.findByRole('button', { name: /synthesize from logs/i })).toBeInTheDocument()
  })

  it('opens ReviewModal with review text when "Review · Alignment" is clicked', async () => {
    const user = userEvent.setup()
    renderWithProviders(<JobSearchProfile />)
    await waitFor(() => expect(screen.getByRole('button', { name: /review · alignment/i })).toBeInTheDocument())

    await user.click(screen.getByRole('button', { name: /review · alignment/i }))

    await waitFor(() =>
      expect(screen.getByText((_, el) =>
        el?.tagName === 'P' && (el.textContent ?? '').includes('Career Narrative does not align'),
      )).toBeInTheDocument(),
    )
    expect(screen.getByText('Profile Review · Alignment')).toBeInTheDocument()
    expect(screen.getByText('2 issues found')).toBeInTheDocument()
  })

  it('closes ReviewModal when Close is clicked', async () => {
    const user = userEvent.setup()
    renderWithProviders(<JobSearchProfile />)
    await waitFor(() => expect(screen.getByRole('button', { name: /review · alignment/i })).toBeInTheDocument())

    await user.click(screen.getByRole('button', { name: /review · alignment/i }))
    await screen.findByText('Profile Review · Alignment')

    await user.click(screen.getByRole('button', { name: /close/i }))

    await waitFor(() =>
      expect(screen.queryByText('Profile Review · Alignment')).not.toBeInTheDocument(),
    )
  })

  it('opens Quality Audit modal when "Review · Quality" is clicked', async () => {
    const user = userEvent.setup()
    renderWithProviders(<JobSearchProfile />)
    await waitFor(() => expect(screen.getByRole('button', { name: /review · quality/i })).toBeInTheDocument())

    await user.click(screen.getByRole('button', { name: /review · quality/i }))

    await waitFor(() => expect(screen.getByText('Profile Quality Audit')).toBeInTheDocument())
  })

  it('shows proposed update card and calls PATCH on Accept', async () => {
    let patchCalled = false
    let patchedSectionId = ''
    server.use(
      http.patch('/api/v1/profile/sections/:id', ({ params }) => {
        patchCalled = true
        patchedSectionId = params.id as string
        return HttpResponse.json({ success: true, version_id: 2 })
      }),
    )

    const user = userEvent.setup()
    renderWithProviders(<JobSearchProfile />)
    await waitFor(() => expect(screen.getByText('Career Narrative')).toBeInTheDocument())

    // Activate the career_narrative section
    await user.click(screen.getByText('Career Narrative').closest('div')!)
    await user.click(await screen.findByRole('button', { name: /edit with ai/i }))

    // Manually inject a proposed update by overriding the propose-update endpoint and triggering it.
    // The "Propose Update" button requires messages.length > 0 and not streaming,
    // so we simulate by directly checking that acceptance triggers PATCH.
    // Instead, verify the ProposedUpdateCard itself via the generate-tailoring-rules flow
    // (which sets proposedUpdate on the page level):
    await waitFor(() => expect(screen.getByText('Tailoring Rules')).toBeInTheDocument())
    await user.click(screen.getByText('Tailoring Rules').closest('div')!)
    await user.click(await screen.findByRole('button', { name: /generate rules/i }))

    // After generate-tailoring-rules resolves, a ProposedUpdateCard should appear
    const acceptBtn = await screen.findByRole('button', { name: /^accept$/i })
    expect(screen.getByText(MOCK_PROPOSED_UPDATE.proposed_content)).toBeInTheDocument()

    await user.click(acceptBtn)

    await waitFor(() => {
      expect(patchCalled).toBe(true)
      expect(patchedSectionId).toBe('tailoring_rules')
    })
  })

  it('discards proposed update when Discard is clicked', async () => {
    const user = userEvent.setup()
    renderWithProviders(<JobSearchProfile />)
    await waitFor(() => expect(screen.getByText('Tailoring Rules')).toBeInTheDocument())

    await user.click(screen.getByText('Tailoring Rules').closest('div')!)
    await user.click(await screen.findByRole('button', { name: /generate rules/i }))

    await screen.findByRole('button', { name: /^accept$/i })
    await user.click(screen.getByRole('button', { name: /^discard$/i }))

    await waitFor(() =>
      expect(screen.queryByText(MOCK_PROPOSED_UPDATE.proposed_content)).not.toBeInTheDocument(),
    )
  })

  it('shows error state when sections fail to load', async () => {
    server.use(
      http.get('/api/v1/profile/sections', () => new HttpResponse(null, { status: 500 })),
    )
    renderWithProviders(<JobSearchProfile />)
    await waitFor(() =>
      expect(screen.getByText('Failed to load profile sections.')).toBeInTheDocument(),
    )
  })

  it('shows no-file warning when file_exists is false', async () => {
    server.use(
      http.get('/api/v1/profile/health', () =>
        HttpResponse.json({ ...MOCK_PROFILE_HEALTH, file_exists: false }),
      ),
    )
    renderWithProviders(<JobSearchProfile />)
    await waitFor(() =>
      expect(screen.getByText('jobsearch.md not found.')).toBeInTheDocument(),
    )
  })

  it('disables review buttons when file does not exist', async () => {
    server.use(
      http.get('/api/v1/profile/health', () =>
        HttpResponse.json({ ...MOCK_PROFILE_HEALTH, file_exists: false }),
      ),
    )
    renderWithProviders(<JobSearchProfile />)
    await waitFor(() => expect(screen.getByText('jobsearch.md not found.')).toBeInTheDocument())

    expect(screen.getByRole('button', { name: /review · alignment/i })).toBeDisabled()
    expect(screen.getByRole('button', { name: /review · quality/i })).toBeDisabled()
  })
})
