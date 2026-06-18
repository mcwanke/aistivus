import { describe, it, expect } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createElement } from 'react'
import { http, HttpResponse } from 'msw'
import { server } from '@/test/mocks/server'
import { MOCK_APPLICATION, MOCK_APPLICATION_DETAIL } from '@/test/mocks/handlers'
import {
  useApplications,
  useApplicationDetail,
  usePatchApplication,
  useAddLog,
  useDeleteLog,
  useGeneratePrompt,
} from './useApplications'

function makeWrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return ({ children }: { children: React.ReactNode }) =>
    createElement(QueryClientProvider, { client: qc }, children)
}

describe('useApplications', () => {
  it('returns applications list on success', async () => {
    const { result } = renderHook(() => useApplications(), { wrapper: makeWrapper() })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toEqual([MOCK_APPLICATION])
  })

  it('enters error state on failure', async () => {
    server.use(http.get('/api/v1/applications', () => new HttpResponse(null, { status: 500 })))
    const { result } = renderHook(() => useApplications(), { wrapper: makeWrapper() })
    await waitFor(() => expect(result.current.isError).toBe(true))
  })

  it('appends include_not_started=true when flag is set', async () => {
    let capturedUrl = ''
    server.use(
      http.get('/api/v1/applications', ({ request }) => {
        capturedUrl = request.url
        return HttpResponse.json([MOCK_APPLICATION])
      }),
    )
    const { result } = renderHook(() => useApplications(true), { wrapper: makeWrapper() })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(capturedUrl).toContain('include_not_started=true')
  })
})

describe('useApplicationDetail', () => {
  it('fetches application detail when id is provided', async () => {
    const { result } = renderHook(() => useApplicationDetail(1), { wrapper: makeWrapper() })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toEqual(MOCK_APPLICATION_DETAIL)
  })

  it('stays idle when id is undefined', () => {
    const { result } = renderHook(() => useApplicationDetail(undefined), { wrapper: makeWrapper() })
    expect(result.current.isPending).toBe(true)
    expect(result.current.fetchStatus).toBe('idle')
  })

  it('enters error state on failure', async () => {
    server.use(http.get('/api/v1/applications/:id', () => new HttpResponse(null, { status: 404 })))
    const { result } = renderHook(() => useApplicationDetail(1), { wrapper: makeWrapper() })
    await waitFor(() => expect(result.current.isError).toBe(true))
  })
})

describe('usePatchApplication', () => {
  it('mutates and succeeds', async () => {
    const { result } = renderHook(() => usePatchApplication(), { wrapper: makeWrapper() })
    result.current.mutate({ applicationId: 1, updates: { application_status: 'applied' } })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
  })

  it('enters error state on failure', async () => {
    server.use(http.patch('/api/v1/applications/:id', () => new HttpResponse(null, { status: 500 })))
    const { result } = renderHook(() => usePatchApplication(), { wrapper: makeWrapper() })
    result.current.mutate({ applicationId: 1, updates: { application_status: 'applied' } })
    await waitFor(() => expect(result.current.isError).toBe(true))
  })
})

describe('useAddLog', () => {
  it('mutates and succeeds', async () => {
    const { result } = renderHook(() => useAddLog(), { wrapper: makeWrapper() })
    result.current.mutate({ applicationId: 1, type_value: 'general', log: 'Note.' })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
  })

  it('enters error state on failure', async () => {
    server.use(http.post('/api/v1/applications/:id/logs', () => new HttpResponse(null, { status: 500 })))
    const { result } = renderHook(() => useAddLog(), { wrapper: makeWrapper() })
    result.current.mutate({ applicationId: 1, type_value: 'general', log: 'Note.' })
    await waitFor(() => expect(result.current.isError).toBe(true))
  })
})

describe('useDeleteLog', () => {
  it('mutates and succeeds', async () => {
    const { result } = renderHook(() => useDeleteLog(), { wrapper: makeWrapper() })
    result.current.mutate({ applicationId: 1, logId: 99 })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
  })
})

describe('useGeneratePrompt', () => {
  it('returns prompt on success', async () => {
    const { result } = renderHook(() => useGeneratePrompt(), { wrapper: makeWrapper() })
    result.current.mutate(1)
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data?.prompt).toBe('Generated prompt text')
  })
})
