import { describe, it, expect } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { server } from '@/test/mocks/server'
import { renderWithProviders } from '@/test/utils'
import { CoverLetterSubpage } from './CoverLetterSubpage'
import { MOCK_TYP_DOC } from '@/test/mocks/handlers'

describe('CoverLetterSubpage', () => {
  it('renders upload form', () => {
    renderWithProviders(<CoverLetterSubpage applicationId={1} typstAvailable={true} />)
    expect(screen.getByRole('button', { name: /Upload/ })).toBeInTheDocument()
  })

  it('shows typst warning when unavailable', () => {
    renderWithProviders(<CoverLetterSubpage applicationId={1} typstAvailable={false} />)
    expect(screen.getByText(/Typst not found/)).toBeInTheDocument()
  })

  it('does not show typst warning when available', () => {
    renderWithProviders(<CoverLetterSubpage applicationId={1} typstAvailable={true} />)
    expect(screen.queryByText(/Typst not found/)).not.toBeInTheDocument()
  })

  it('shows cover letter documents from default handler', async () => {
    renderWithProviders(<CoverLetterSubpage applicationId={1} typstAvailable={true} />)
    // Default handler includes MOCK_UPLOADED_PDF with type_value='cover_letter'
    await waitFor(() => expect(screen.getByText('cover.pdf')).toBeInTheDocument())
  })

  it('shows empty state when no cover letter documents', async () => {
    server.use(
      http.get('/api/v1/applications/:id/documents', () =>
        HttpResponse.json([MOCK_TYP_DOC])
      )
    )
    // MOCK_TYP_DOC has type_value='resume' — cover letter list is empty
    renderWithProviders(<CoverLetterSubpage applicationId={1} typstAvailable={true} />)
    await waitFor(() =>
      expect(screen.getByText(/No cover letter documents yet/)).toBeInTheDocument()
    )
  })
})
