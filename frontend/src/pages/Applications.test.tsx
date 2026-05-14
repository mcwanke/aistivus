import { describe, it, expect } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { server } from '@/test/mocks/server'
import { renderWithProviders } from '@/test/utils'
import Applications from './Applications'

describe('Applications page', () => {
  it('shows loading state initially', () => {
    renderWithProviders(<Applications />)
    expect(screen.getByText('Loading applications…')).toBeInTheDocument()
  })

  it('renders application list after data loads', async () => {
    renderWithProviders(<Applications />)
    await waitFor(() => expect(screen.getByText('Acme Corp')).toBeInTheDocument())
    expect(screen.getByText('Senior Engineer')).toBeInTheDocument()
  })

  it('shows application status pill', async () => {
    renderWithProviders(<Applications />)
    await waitFor(() => expect(screen.getByText('applied')).toBeInTheDocument())
  })

  it('shows error state on failure', async () => {
    server.use(http.get('/api/v1/applications', () => new HttpResponse(null, { status: 500 })))
    renderWithProviders(<Applications />)
    await waitFor(() => expect(screen.getByText('Failed to load applications.')).toBeInTheDocument())
  })

  it('shows empty state when no applications exist', async () => {
    server.use(http.get('/api/v1/applications', () => HttpResponse.json([])))
    renderWithProviders(<Applications />)
    await waitFor(() =>
      expect(screen.getByText(/No active applications yet/)).toBeInTheDocument(),
    )
  })
})
