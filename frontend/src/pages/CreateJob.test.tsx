import { describe, it, expect, vi } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { server } from '@/test/mocks/server'
import { renderWithProviders } from '@/test/utils'
import CreateJob from './CreateJob'

describe('CreateJob', () => {
  // ─── Left column ──────────────────────────────────────────────────────────

  it('renders URL import field in left column', () => {
    renderWithProviders(<CreateJob />)
    expect(screen.getByPlaceholderText('https://…')).toBeInTheDocument()
  })

  it('renders Import from URL button in left column', () => {
    renderWithProviders(<CreateJob />)
    expect(screen.getByRole('button', { name: /import from url/i })).toBeInTheDocument()
  })

  it('renders Create Job button in left column', () => {
    renderWithProviders(<CreateJob />)
    expect(screen.getByRole('button', { name: /create job/i })).toBeInTheDocument()
  })

  it('renders Clear button in left column', () => {
    renderWithProviders(<CreateJob />)
    expect(screen.getByRole('button', { name: /clear/i })).toBeInTheDocument()
  })

  // ─── Right column ─────────────────────────────────────────────────────────

  it('renders Company field in right column', () => {
    renderWithProviders(<CreateJob />)
    expect(screen.getByPlaceholderText('Acme Corp')).toBeInTheDocument()
  })

  it('renders Job Title field in right column', () => {
    renderWithProviders(<CreateJob />)
    expect(screen.getByPlaceholderText('Engineering Manager')).toBeInTheDocument()
  })

  it('renders Job Description textarea in right column', () => {
    renderWithProviders(<CreateJob />)
    expect(screen.getByPlaceholderText(/paste the full job description/i)).toBeInTheDocument()
  })

  it('renders Location and Work Type fields', () => {
    renderWithProviders(<CreateJob />)
    expect(screen.getByPlaceholderText('Remote')).toBeInTheDocument()
    expect(screen.getByRole('combobox')).toBeInTheDocument()
  })

  // ─── Validation ───────────────────────────────────────────────────────────

  it('shows error when Create Job clicked without company', async () => {
    renderWithProviders(<CreateJob />)
    await userEvent.click(screen.getByRole('button', { name: /create job/i }))
    expect(screen.getByText(/company name is required/i)).toBeInTheDocument()
  })

  it('shows error when Create Job clicked without title', async () => {
    renderWithProviders(<CreateJob />)
    await userEvent.type(screen.getByPlaceholderText('Acme Corp'), 'Test Co')
    await userEvent.click(screen.getByRole('button', { name: /create job/i }))
    expect(screen.getByText(/job title is required/i)).toBeInTheDocument()
  })

  // ─── Success modal ─────────────────────────────────────────────────────────

  it('shows success modal after job is created', async () => {
    renderWithProviders(<CreateJob />)

    await userEvent.type(screen.getByPlaceholderText('Acme Corp'), 'Acme Corp')
    await userEvent.type(screen.getByPlaceholderText('Engineering Manager'), 'Senior Engineer')
    await userEvent.click(screen.getByRole('button', { name: /create job/i }))

    await waitFor(() =>
      expect(screen.getByText('Job created successfully.')).toBeInTheDocument()
    )
  })

  it('success modal offers Go To Job and Create Another Job buttons', async () => {
    renderWithProviders(<CreateJob />)

    await userEvent.type(screen.getByPlaceholderText('Acme Corp'), 'Acme Corp')
    await userEvent.type(screen.getByPlaceholderText('Engineering Manager'), 'Senior Engineer')
    await userEvent.click(screen.getByRole('button', { name: /create job/i }))

    await waitFor(() => screen.getByText('Job created successfully.'))

    expect(screen.getByRole('button', { name: /go to job/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /create another job/i })).toBeInTheDocument()
  })

  it('clears form when Create Another Job is clicked', async () => {
    renderWithProviders(<CreateJob />)

    const companyInput = screen.getByPlaceholderText('Acme Corp')
    await userEvent.type(companyInput, 'Acme Corp')
    await userEvent.type(screen.getByPlaceholderText('Engineering Manager'), 'Senior Engineer')
    await userEvent.click(screen.getByRole('button', { name: /create job/i }))

    await waitFor(() => screen.getByText('Job created successfully.'))
    await userEvent.click(screen.getByRole('button', { name: /create another job/i }))

    expect(companyInput).toHaveValue('')
  })

  // ─── Scrape ───────────────────────────────────────────────────────────────

  it('populates fields after successful URL scrape', async () => {
    renderWithProviders(<CreateJob />)

    const urlInput = screen.getByPlaceholderText('https://…')
    await userEvent.type(urlInput, 'https://example.com/job')
    await userEvent.click(screen.getByRole('button', { name: /import from url/i }))

    await waitFor(() =>
      expect(screen.getByPlaceholderText('Acme Corp')).toHaveValue('Acme Corp')
    )
    expect(screen.getByPlaceholderText('Engineering Manager')).toHaveValue('Senior Engineer')
  })

  it('shows scrape error when scrape fails', async () => {
    server.use(
      http.post('/api/v1/scrape', () =>
        HttpResponse.json({ success: false, error: 'Crawl4AI unavailable' }),
        { once: true }
      ),
    )

    renderWithProviders(<CreateJob />)
    const urlInput = screen.getByPlaceholderText('https://…')
    await userEvent.type(urlInput, 'https://example.com/job')
    await userEvent.click(screen.getByRole('button', { name: /import from url/i }))

    await waitFor(() =>
      expect(screen.getByText(/crawl4ai unavailable/i)).toBeInTheDocument()
    )
  })
})
