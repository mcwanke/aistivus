import { describe, it, expect } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithProviders } from '@/test/utils'
import Evaluate from './Evaluate'

describe('Evaluate page', () => {
  it('renders the Evaluate heading', () => {
    renderWithProviders(<Evaluate />)
    expect(screen.getByRole('heading', { name: 'Evaluate' })).toBeInTheDocument()
  })

  it('renders the JD textarea', () => {
    renderWithProviders(<Evaluate />)
    expect(
      screen.getByPlaceholderText('Paste the full job description here…'),
    ).toBeInTheDocument()
  })

  it('renders company and job title inputs', () => {
    renderWithProviders(<Evaluate />)
    expect(screen.getByPlaceholderText('Acme Corp')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('Engineering Manager')).toBeInTheDocument()
  })

  it('renders the Evaluate submit button', () => {
    renderWithProviders(<Evaluate />)
    expect(screen.getByRole('button', { name: 'Evaluate' })).toBeInTheDocument()
  })

  it('renders Import Claude eval button', () => {
    renderWithProviders(<Evaluate />)
    expect(screen.getByRole('button', { name: 'Import Claude eval' })).toBeInTheDocument()
  })

  it('shows model selector after models load', async () => {
    renderWithProviders(<Evaluate />)
    await waitFor(() =>
      expect(screen.getByRole('option', { name: /llama3/ })).toBeInTheDocument(),
    )
  })

  it('allows typing in the JD textarea', async () => {
    const user = userEvent.setup()
    renderWithProviders(<Evaluate />)
    const textarea = screen.getByPlaceholderText('Paste the full job description here…')
    await user.type(textarea, 'We are hiring')
    expect((textarea as HTMLTextAreaElement).value).toContain('We are hiring')
  })

  it('allows typing company and title', async () => {
    const user = userEvent.setup()
    renderWithProviders(<Evaluate />)
    const company = screen.getByPlaceholderText('Acme Corp')
    const title = screen.getByPlaceholderText('Engineering Manager')
    await user.type(company, 'Test Corp')
    await user.type(title, 'Staff Engineer')
    expect((company as HTMLInputElement).value).toBe('Test Corp')
    expect((title as HTMLInputElement).value).toBe('Staff Engineer')
  })

  it('shows result panel after successful evaluation', async () => {
    const user = userEvent.setup()
    renderWithProviders(<Evaluate />)

    const textarea = screen.getByPlaceholderText('Paste the full job description here…')
    const company = screen.getByPlaceholderText('Acme Corp')
    const title = screen.getByPlaceholderText('Engineering Manager')

    await user.type(textarea, 'Senior engineer role requiring Python.')
    await user.type(company, 'Acme')
    await user.type(title, 'Engineer')

    await user.click(screen.getByRole('button', { name: 'Evaluate' }))

    // Result panel shows company, title, and overall score from mock (8)
    await waitFor(() => expect(screen.getByText('8.0')).toBeInTheDocument(), { timeout: 5000 })
    expect(screen.getByText('/10')).toBeInTheDocument()
  })

  it('shows idle hint text by default', () => {
    renderWithProviders(<Evaluate />)
    expect(screen.getByText('Paste a job description and hit Evaluate.')).toBeInTheDocument()
  })

  it('renders Clear button and clears fields', async () => {
    const user = userEvent.setup()
    renderWithProviders(<Evaluate />)
    const textarea = screen.getByPlaceholderText('Paste the full job description here…')
    await user.type(textarea, 'Some JD text')
    await user.click(screen.getByRole('button', { name: 'Clear' }))
    expect((textarea as HTMLTextAreaElement).value).toBe('')
  })
})
