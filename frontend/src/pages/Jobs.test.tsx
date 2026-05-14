import { describe, it, expect } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { server } from '@/test/mocks/server'
import { renderWithProviders } from '@/test/utils'
import Jobs from './Jobs'

describe('Jobs page', () => {
  it('shows loading state initially', () => {
    renderWithProviders(<Jobs />)
    expect(screen.getByText('Loading jobs…')).toBeInTheDocument()
  })

  it('renders job list after data loads', async () => {
    renderWithProviders(<Jobs />)
    await waitFor(() => expect(screen.getByText('Acme Corp')).toBeInTheDocument())
    expect(screen.getByText('Senior Engineer')).toBeInTheDocument()
  })

  it('shows score values for evaluated jobs', async () => {
    renderWithProviders(<Jobs />)
    await waitFor(() => expect(screen.getByText('Acme Corp')).toBeInTheDocument())
    // Score columns rendered as formatted numbers
    expect(screen.getByText('7.8')).toBeInTheDocument()
  })

  it('shows error state on failure', async () => {
    server.use(http.get('/api/v1/jobs', () => new HttpResponse(null, { status: 500 })))
    renderWithProviders(<Jobs />)
    await waitFor(() => expect(screen.getByText('Failed to load jobs.')).toBeInTheDocument())
  })

  it('shows empty state when no jobs exist', async () => {
    server.use(http.get('/api/v1/jobs', () => HttpResponse.json([])))
    renderWithProviders(<Jobs />)
    await waitFor(() => expect(screen.getByText(/No jobs yet/)).toBeInTheDocument())
  })

  it('shows remote type pill for remote jobs', async () => {
    renderWithProviders(<Jobs />)
    await waitFor(() => expect(screen.getByText('Remote')).toBeInTheDocument())
  })
})
