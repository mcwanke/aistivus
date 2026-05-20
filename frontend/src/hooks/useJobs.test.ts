import { describe, it, expect } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createElement } from 'react'
import { http, HttpResponse } from 'msw'
import { server } from '@/test/mocks/server'
import { MOCK_JOB, MOCK_JOB_DETAIL } from '@/test/mocks/handlers'
import { useJobs, useJobDetail, usePatchJob, useStartApplication, useActivateJob } from './useJobs'

function makeWrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return ({ children }: { children: React.ReactNode }) =>
    createElement(QueryClientProvider, { client: qc }, children)
}

describe('useJobs', () => {
  it('returns jobs list on success', async () => {
    const { result } = renderHook(() => useJobs(), { wrapper: makeWrapper() })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toEqual([MOCK_JOB])
  })

  it('enters error state on failure', async () => {
    server.use(http.get('/api/v1/jobs', () => new HttpResponse(null, { status: 500 })))
    const { result } = renderHook(() => useJobs(), { wrapper: makeWrapper() })
    await waitFor(() => expect(result.current.isError).toBe(true))
  })
})

describe('useJobDetail', () => {
  it('fetches job detail when jobId is provided', async () => {
    const { result } = renderHook(() => useJobDetail(1), { wrapper: makeWrapper() })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toEqual(MOCK_JOB_DETAIL)
  })

  it('stays idle when jobId is undefined', () => {
    const { result } = renderHook(() => useJobDetail(undefined), { wrapper: makeWrapper() })
    expect(result.current.isPending).toBe(true)
    expect(result.current.fetchStatus).toBe('idle')
  })

  it('enters error state on failure', async () => {
    server.use(http.get('/api/v1/jobs/:id', () => new HttpResponse(null, { status: 404 })))
    const { result } = renderHook(() => useJobDetail(1), { wrapper: makeWrapper() })
    await waitFor(() => expect(result.current.isError).toBe(true))
  })
})

describe('usePatchJob', () => {
  it('mutates and succeeds', async () => {
    const { result } = renderHook(() => usePatchJob(), { wrapper: makeWrapper() })
    result.current.mutate({ jobId: 1, updates: { title: 'New Title' } })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
  })

  it('enters error state on failure', async () => {
    server.use(http.patch('/api/v1/jobs/:id', () => new HttpResponse(null, { status: 500 })))
    const { result } = renderHook(() => usePatchJob(), { wrapper: makeWrapper() })
    result.current.mutate({ jobId: 1, updates: { title: 'New Title' } })
    await waitFor(() => expect(result.current.isError).toBe(true))
  })
})

describe('useActivateJob', () => {
  it('mutates and returns updated job on success', async () => {
    const { result } = renderHook(() => useActivateJob(), { wrapper: makeWrapper() })
    result.current.mutate(1)
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect((result.current.data as { is_active: number }).is_active).toBe(1)
  })

  it('enters error state on failure', async () => {
    server.use(http.post('/api/v1/jobs/:id/activate', () => new HttpResponse(null, { status: 404 })))
    const { result } = renderHook(() => useActivateJob(), { wrapper: makeWrapper() })
    result.current.mutate(999)
    await waitFor(() => expect(result.current.isError).toBe(true))
  })
})

describe('useStartApplication', () => {
  it('mutates and succeeds', async () => {
    const { result } = renderHook(() => useStartApplication(), { wrapper: makeWrapper() })
    result.current.mutate(1)
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
  })

  it('enters error state on failure', async () => {
    server.use(http.post('/api/v1/applications', () => HttpResponse.json({ detail: 'Already exists' }, { status: 409 })))
    const { result } = renderHook(() => useStartApplication(), { wrapper: makeWrapper() })
    result.current.mutate(1)
    await waitFor(() => expect(result.current.isError).toBe(true))
  })
})
