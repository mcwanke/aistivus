// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { server } from '@/test/mocks/server'
import { renderWithProviders } from '@/test/utils'
import PromptEditor from './PromptEditor'

// MSW returns: segments_text = '[[READONLY]]You are an evaluator.[[/READONLY]][[EDITABLE]]Rate the job.[[/EDITABLE]]'
// preview: { preview_text: 'You are an evaluator.\nRate the job.' }
// prompts list: [{ prompt_key: 'eval_internal', label: 'Evaluation — Internal', version: 1 }]

describe('PromptEditor', () => {
  describe('initial render', () => {
    it('renders the prompt dropdown', async () => {
      renderWithProviders(<PromptEditor />)
      await waitFor(() =>
        expect(screen.getByRole('combobox')).toBeInTheDocument(),
      )
    })

    it('populates dropdown with prompt list from API', async () => {
      renderWithProviders(<PromptEditor />)
      await waitFor(() =>
        expect(screen.getByRole('option', { name: 'Evaluation — Internal' })).toBeInTheDocument(),
      )
    })

    it('renders Save and Run Feedback Loop buttons', async () => {
      renderWithProviders(<PromptEditor />)
      await waitFor(() => {
        expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Run Feedback Loop' })).toBeInTheDocument()
      })
    })
  })

  describe('segment rendering', () => {
    it('renders editable segment as textarea', async () => {
      renderWithProviders(<PromptEditor />)
      await waitFor(() =>
        expect(screen.getByDisplayValue('Rate the job.')).toBeInTheDocument(),
      )
      expect(screen.getByDisplayValue('Rate the job.')).toBeInstanceOf(HTMLTextAreaElement)
    })

    it('renders readonly segment as muted text (not textarea)', async () => {
      renderWithProviders(<PromptEditor />)
      await waitFor(() =>
        expect(screen.getByText('You are an evaluator.')).toBeInTheDocument(),
      )
      expect(screen.queryByDisplayValue('You are an evaluator.')).not.toBeInTheDocument()
    })
  })

  describe('preview pane', () => {
    it('renders preview text from API', async () => {
      renderWithProviders(<PromptEditor />)
      // Testing Library normalizes whitespace, so \n becomes a space — match both parts together
      await waitFor(() =>
        expect(screen.getByText(/You are an evaluator\. Rate the job\./)).toBeInTheDocument(),
      )
    })
  })

  describe('save flow', () => {
    it('calls save API and shows confirmation on success', async () => {
      const user = userEvent.setup()
      renderWithProviders(<PromptEditor />)
      await waitFor(() =>
        expect(screen.getByRole('button', { name: 'Save' })).not.toBeDisabled(),
      )
      await user.click(screen.getByRole('button', { name: 'Save' }))
      await waitFor(() =>
        expect(screen.getByText('Saved (v2)')).toBeInTheDocument(),
      )
    })

    it('clears saved confirmation when textarea content changes', async () => {
      const user = userEvent.setup()
      renderWithProviders(<PromptEditor />)
      await waitFor(() =>
        expect(screen.getByDisplayValue('Rate the job.')).toBeInTheDocument(),
      )
      await user.click(screen.getByRole('button', { name: 'Save' }))
      await waitFor(() => expect(screen.getByText('Saved (v2)')).toBeInTheDocument())
      const textarea = screen.getByDisplayValue('Rate the job.')
      await user.type(textarea, ' Updated.')
      expect(screen.queryByText('Saved (v2)')).not.toBeInTheDocument()
    })
  })

  describe('temperature', () => {
    it('renders temperature input when prompt key is eval_analysis', async () => {
      server.use(
        http.get('/api/v1/prompts', () =>
          HttpResponse.json([{ prompt_key: 'eval_analysis', label: 'Eval Analysis', version: 1 }]),
        ),
        http.get('/api/v1/prompts/:key', () =>
          HttpResponse.json({
            prompt_key: 'eval_analysis',
            label: 'Eval Analysis',
            version: 1,
            segments_text: '[[EDITABLE]]Rate the job.[[/EDITABLE]]',
            preview_context: null,
            temperature: 0.3,
          }),
        ),
      )
      renderWithProviders(<PromptEditor />)
      await waitFor(() =>
        expect((screen.getByRole('spinbutton') as HTMLInputElement).value).toBe('0.3'),
      )
    })

    it('includes temperature in save payload', async () => {
      let capturedBody: Record<string, unknown> | null = null
      server.use(
        http.get('/api/v1/prompts', () =>
          HttpResponse.json([{ prompt_key: 'eval_analysis', label: 'Eval Analysis', version: 1 }]),
        ),
        http.get('/api/v1/prompts/:key', () =>
          HttpResponse.json({
            prompt_key: 'eval_analysis',
            label: 'Eval Analysis',
            version: 1,
            segments_text: '[[EDITABLE]]Rate the job.[[/EDITABLE]]',
            preview_context: null,
            temperature: 0.3,
          }),
        ),
        http.post('/api/v1/prompts/:key/save', async ({ request }) => {
          capturedBody = (await request.json()) as Record<string, unknown>
          return HttpResponse.json({ success: true, version: 2 })
        }),
      )
      const user = userEvent.setup()
      renderWithProviders(<PromptEditor />)
      await waitFor(() =>
        expect(screen.getByRole('button', { name: 'Save' })).not.toBeDisabled(),
      )
      await user.click(screen.getByRole('button', { name: 'Save' }))
      await waitFor(() => expect(capturedBody).not.toBeNull())
      expect(capturedBody).toHaveProperty('temperature')
      expect(typeof capturedBody!['temperature']).toBe('number')
    })
  })

  describe('feedback loop', () => {
    it('shows suggestions panel after feedback loop succeeds', async () => {
      const user = userEvent.setup()
      renderWithProviders(<PromptEditor />)
      await waitFor(() =>
        expect(screen.getByRole('button', { name: 'Run Feedback Loop' })).not.toBeDisabled(),
      )
      await user.click(screen.getByRole('button', { name: 'Run Feedback Loop' }))
      await waitFor(() =>
        expect(screen.getByText('Consider clarifying the scoring criteria.')).toBeInTheDocument(),
      )
    })

    it('dismiss button hides suggestions panel', async () => {
      const user = userEvent.setup()
      renderWithProviders(<PromptEditor />)
      await waitFor(() =>
        expect(screen.getByRole('button', { name: 'Run Feedback Loop' })).not.toBeDisabled(),
      )
      await user.click(screen.getByRole('button', { name: 'Run Feedback Loop' }))
      await waitFor(() =>
        expect(screen.getByText('Consider clarifying the scoring criteria.')).toBeInTheDocument(),
      )
      await user.click(screen.getByRole('button', { name: 'Dismiss' }))
      expect(screen.queryByText('Consider clarifying the scoring criteria.')).not.toBeInTheDocument()
    })
  })
})
