import { describe, it, expect } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { server } from '@/test/mocks/server'
import { renderWithProviders } from '@/test/utils'
import { ResumeSubpage } from './ResumeSubpage'
import { MOCK_UPLOADED_PDF } from '@/test/mocks/handlers'

describe('ResumeSubpage', () => {
  it('renders upload form', () => {
    renderWithProviders(<ResumeSubpage applicationId={1} typstAvailable={true} />)
    expect(screen.getByRole('button', { name: /Upload/ })).toBeInTheDocument()
  })

  it('shows typst warning when unavailable', () => {
    renderWithProviders(<ResumeSubpage applicationId={1} typstAvailable={false} />)
    expect(screen.getByText(/Typst not found/)).toBeInTheDocument()
  })

  it('does not show typst warning when available', () => {
    renderWithProviders(<ResumeSubpage applicationId={1} typstAvailable={true} />)
    expect(screen.queryByText(/Typst not found/)).not.toBeInTheDocument()
  })

  it('shows resume documents from default handler', async () => {
    renderWithProviders(<ResumeSubpage applicationId={1} typstAvailable={true} />)
    // Default handler includes MOCK_TYP_DOC with type_value='resume'
    await waitFor(() => expect(screen.getByText('resume_v1.typ')).toBeInTheDocument())
  })

  it('shows empty state when no resume documents', async () => {
    server.use(
      http.get('/api/v1/applications/:id/documents', () =>
        HttpResponse.json([MOCK_UPLOADED_PDF])
      )
    )
    // MOCK_UPLOADED_PDF has type_value='cover_letter' — resume list is empty
    renderWithProviders(<ResumeSubpage applicationId={1} typstAvailable={true} />)
    await waitFor(() =>
      expect(screen.getByText(/No resume documents yet/)).toBeInTheDocument()
    )
  })
})
