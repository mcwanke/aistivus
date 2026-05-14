import { describe, it, expect } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithProviders } from '@/test/utils'
import Settings from './Settings'

describe('Settings page', () => {
  it('renders the Settings label', () => {
    renderWithProviders(<Settings />)
    expect(screen.getByText('Settings')).toBeInTheDocument()
  })

  it('renders tab navigation', () => {
    renderWithProviders(<Settings />)
    expect(screen.getByRole('button', { name: 'Models' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'System Types' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'jobsearch.md' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'System Info' })).toBeInTheDocument()
  })

  it('shows LLM Models section by default', async () => {
    renderWithProviders(<Settings />)
    await waitFor(() => expect(screen.getByText('LLM Models')).toBeInTheDocument())
    expect(screen.getByText('llama3')).toBeInTheDocument()
  })

  it('switches to System Types tab on click', async () => {
    const user = userEvent.setup()
    renderWithProviders(<Settings />)
    await user.click(screen.getByRole('button', { name: 'System Types' }))
    await waitFor(() => expect(screen.getByText('general')).toBeInTheDocument())
  })

  it('switches to jobsearch.md tab on click', async () => {
    const user = userEvent.setup()
    renderWithProviders(<Settings />)
    await user.click(screen.getByRole('button', { name: 'jobsearch.md' }))
    await waitFor(() => expect(screen.getByText(/My Job Search/)).toBeInTheDocument())
  })
})
