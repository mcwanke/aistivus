// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithProviders } from '@/test/utils'
import EvaluationFeedbackButton from './EvaluationFeedbackButton'

function renderButton(overrides: Partial<React.ComponentProps<typeof EvaluationFeedbackButton>> = {}) {
  return renderWithProviders(
    <EvaluationFeedbackButton
      promptType="evaluation_internal"
      evaluationId={1}
      {...overrides}
    />,
  )
}

describe('EvaluationFeedbackButton', () => {
  describe('uncontrolled mode (trigger button)', () => {
    it('renders the trigger button', () => {
      renderButton()
      expect(screen.getByRole('button', { name: 'Rate this evaluation' })).toBeInTheDocument()
    })

    it('does not show the modal initially', () => {
      renderButton()
      expect(screen.queryByText('Does this evaluation look accurate?')).not.toBeInTheDocument()
    })

    it('opens modal on trigger click', async () => {
      const user = userEvent.setup()
      renderButton()
      await user.click(screen.getByRole('button', { name: 'Rate this evaluation' }))
      expect(screen.getByText('Does this evaluation look accurate?')).toBeInTheDocument()
    })

    it('closes modal on Cancel', async () => {
      const user = userEvent.setup()
      renderButton()
      await user.click(screen.getByRole('button', { name: 'Rate this evaluation' }))
      await user.click(screen.getByRole('button', { name: 'Cancel' }))
      expect(screen.queryByText('Does this evaluation look accurate?')).not.toBeInTheDocument()
    })
  })

  describe('agree / disagree toggles', () => {
    it('Agree and Disagree buttons are rendered in the modal', async () => {
      const user = userEvent.setup()
      renderButton()
      await user.click(screen.getByRole('button', { name: 'Rate this evaluation' }))
      expect(screen.getByRole('button', { name: 'Agree' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Disagree' })).toBeInTheDocument()
    })

    it('dimension selector hidden when Agree is selected', async () => {
      const user = userEvent.setup()
      renderButton()
      await user.click(screen.getByRole('button', { name: 'Rate this evaluation' }))
      await user.click(screen.getByRole('button', { name: 'Agree' }))
      expect(screen.queryByText('What was off? (optional)')).not.toBeInTheDocument()
    })

    it('dimension selector shown when Disagree is selected', async () => {
      const user = userEvent.setup()
      renderButton()
      await user.click(screen.getByRole('button', { name: 'Rate this evaluation' }))
      await user.click(screen.getByRole('button', { name: 'Disagree' }))
      expect(screen.getByText('What was off? (optional)')).toBeInTheDocument()
    })

    it('dimension options are rendered when Disagree selected', async () => {
      const user = userEvent.setup()
      renderButton()
      await user.click(screen.getByRole('button', { name: 'Rate this evaluation' }))
      await user.click(screen.getByRole('button', { name: 'Disagree' }))
      expect(screen.getByRole('button', { name: 'Overall Score' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Role Fit' })).toBeInTheDocument()
    })
  })

  describe('submit flow', () => {
    it('Submit is disabled when no agree/disagree selected', async () => {
      const user = userEvent.setup()
      renderButton()
      await user.click(screen.getByRole('button', { name: 'Rate this evaluation' }))
      expect(screen.getByRole('button', { name: 'Submit' })).toBeDisabled()
    })

    it('shows Feedback submitted and disables trigger after submit', async () => {
      const user = userEvent.setup()
      renderButton()
      await user.click(screen.getByRole('button', { name: 'Rate this evaluation' }))
      await user.click(screen.getByRole('button', { name: 'Agree' }))
      await user.click(screen.getByRole('button', { name: 'Submit' }))
      await waitFor(() =>
        expect(screen.getByRole('button', { name: 'Feedback submitted' })).toBeInTheDocument(),
      )
      expect(screen.getByRole('button', { name: 'Feedback submitted' })).toBeDisabled()
    })
  })

  describe('controlled mode (isOpen prop)', () => {
    it('shows modal when isOpen=true without rendering a trigger button', () => {
      renderButton({ isOpen: true, onClose: () => {} })
      expect(screen.getByText('Does this evaluation look accurate?')).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Rate this evaluation' })).not.toBeInTheDocument()
    })

    it('hides modal when isOpen=false', () => {
      renderButton({ isOpen: false, onClose: () => {} })
      expect(screen.queryByText('Does this evaluation look accurate?')).not.toBeInTheDocument()
    })
  })
})
