import { describe, it, expect } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { server } from '@/test/mocks/server'
import { renderWithProviders } from '@/test/utils'
import Evaluate from './Evaluate'

async function runEvaluation(): Promise<void> {
  const user = userEvent.setup()
  const textarea = screen.getByPlaceholderText('Paste the full job description here…')
  await user.type(textarea, 'Senior engineer role requiring Python.')
  await user.click(screen.getByRole('button', { name: 'Evaluate' }))
  await waitFor(
    () => expect(screen.getByRole('button', { name: 'Go To Job' })).toBeInTheDocument(),
    { timeout: 5000 },
  )
}

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

    await waitFor(
      () => expect(screen.getByRole('button', { name: 'Go To Job' })).toBeInTheDocument(),
      { timeout: 5000 },
    )
    expect(screen.getByRole('button', { name: 'Evaluate Again' })).toBeInTheDocument()
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

describe('Evaluate page — URL import', () => {
  it('renders the URL import input', () => {
    renderWithProviders(<Evaluate />)
    expect(screen.getByPlaceholderText('https://…')).toBeInTheDocument()
  })

  it('renders the Import from URL button', () => {
    renderWithProviders(<Evaluate />)
    expect(screen.getByRole('button', { name: 'Import from URL' })).toBeInTheDocument()
  })

  it('pre-fills fields after a successful scrape', async () => {
    const user = userEvent.setup()
    renderWithProviders(<Evaluate />)
    const urlInput = screen.getByPlaceholderText('https://…')
    await user.type(urlInput, 'https://example.com/job')
    await user.click(screen.getByRole('button', { name: 'Import from URL' }))
    await waitFor(() =>
      expect((screen.getByPlaceholderText('Acme Corp') as HTMLInputElement).value).toBe('Acme Corp'),
      { timeout: 3000 },
    )
    expect((screen.getByPlaceholderText('Engineering Manager') as HTMLInputElement).value).toBe('Senior Engineer')
  })

  it('shows partial banner on partial scrape quality', async () => {
    const user = userEvent.setup()
    server.use(
      http.post('/api/v1/scrape', () =>
        HttpResponse.json({
          success: true,
          scrape_quality: 'partial',
          apply_url: 'https://example.com/job',
          title: null,
          company: null,
          location: null,
          remote_type: null,
          pay_band: null,
          jd_text: 'Short description.',
          error: null,
        }),
      ),
    )
    renderWithProviders(<Evaluate />)
    await user.type(screen.getByPlaceholderText('https://…'), 'https://example.com/job')
    await user.click(screen.getByRole('button', { name: 'Import from URL' }))
    await waitFor(() =>
      expect(screen.getByText(/Partial scrape/)).toBeInTheDocument(),
      { timeout: 3000 },
    )
  })

  it('shows fill-gaps button when scrape leaves null fields', async () => {
    const user = userEvent.setup()
    server.use(
      http.post('/api/v1/scrape', () =>
        HttpResponse.json({
          success: true,
          scrape_quality: 'full',
          apply_url: 'https://example.com/job',
          title: null,
          company: null,
          location: null,
          remote_type: null,
          pay_band: null,
          jd_text: 'We are looking for a senior engineer to join our team.',
          error: null,
        }),
      ),
    )
    renderWithProviders(<Evaluate />)
    await user.type(screen.getByPlaceholderText('https://…'), 'https://example.com/job')
    await user.click(screen.getByRole('button', { name: 'Import from URL' }))
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Fill gaps with AI' })).toBeInTheDocument(),
      { timeout: 3000 },
    )
  })

  it('shows inline error when Crawl4AI is unavailable', async () => {
    const user = userEvent.setup()
    server.use(
      http.post('/api/v1/scrape', () =>
        HttpResponse.json({
          success: false,
          scrape_quality: 'partial',
          apply_url: 'https://example.com/job',
          title: null,
          company: null,
          location: null,
          remote_type: null,
          pay_band: null,
          jd_text: '',
          error: 'Crawl4AI service unavailable',
        }),
      ),
    )
    renderWithProviders(<Evaluate />)
    await user.type(screen.getByPlaceholderText('https://…'), 'https://example.com/job')
    await user.click(screen.getByRole('button', { name: 'Import from URL' }))
    await waitFor(() =>
      expect(screen.getByText(/unavailable/i)).toBeInTheDocument(),
      { timeout: 3000 },
    )
  })
})

describe('Evaluate page — post-action widget', () => {
  it('shows Go To Job and Evaluate Again after evaluation', async () => {
    renderWithProviders(<Evaluate />)
    await runEvaluation()
    expect(screen.getByRole('button', { name: 'Go To Job' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Evaluate Again' })).toBeInTheDocument()
  })

  it('"Evaluate Again" clears the form and hides the widget', async () => {
    const user = userEvent.setup()
    renderWithProviders(<Evaluate />)
    await runEvaluation()
    await user.click(screen.getByRole('button', { name: 'Evaluate Again' }))
    const textarea = screen.getByPlaceholderText('Paste the full job description here…')
    expect((textarea as HTMLTextAreaElement).value).toBe('')
    expect(screen.queryByRole('button', { name: 'Go To Job' })).not.toBeInTheDocument()
  })

  it('shows Create Without Eval button in actions row', async () => {
    renderWithProviders(<Evaluate />)
    expect(screen.getByRole('button', { name: 'Create Without Eval' })).toBeInTheDocument()
  })

  it('shows Go To Job and success message after create without eval', async () => {
    const user = userEvent.setup()
    renderWithProviders(<Evaluate />)
    const companyInput = screen.getByPlaceholderText('Acme Corp')
    const titleInput = screen.getByPlaceholderText('Engineering Manager')
    await user.type(companyInput, 'Acme')
    await user.type(titleInput, 'Engineer')
    await user.click(screen.getByRole('button', { name: 'Create Without Eval' }))
    await waitFor(
      () => expect(screen.getByRole('button', { name: 'Go To Job' })).toBeInTheDocument(),
      { timeout: 5000 },
    )
    expect(screen.getByText('Job created and added to your list.')).toBeInTheDocument()
  })
})
