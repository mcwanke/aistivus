import { describe, it, expect } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createElement } from 'react'
import { http, HttpResponse } from 'msw'
import { server } from '@/test/mocks/server'
import { MOCK_LLM_LOG } from '@/test/mocks/handlers'
import { useLlmCallLog } from './useLLMUsage'

function makeWrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return ({ children }: { children: React.ReactNode }) =>
    createElement(QueryClientProvider, { client: qc }, children)
}

describe('useLlmCallLog', () => {
  it('returns log entries on success with no params', async () => {
    const { result } = renderHook(() => useLlmCallLog(), { wrapper: makeWrapper() })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toEqual(MOCK_LLM_LOG)
  })

  it('builds query string with job_id param', async () => {
    let capturedUrl = ''
    server.use(
      http.get('/api/v1/llm-call-log', ({ request }) => {
        capturedUrl = request.url
        return HttpResponse.json(MOCK_LLM_LOG)
      }),
    )
    const { result } = renderHook(() => useLlmCallLog({ job_id: 42 }), { wrapper: makeWrapper() })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(capturedUrl).toContain('job_id=42')
  })

  it('builds query string with call_type and limit params', async () => {
    let capturedUrl = ''
    server.use(
      http.get('/api/v1/llm-call-log', ({ request }) => {
        capturedUrl = request.url
        return HttpResponse.json(MOCK_LLM_LOG)
      }),
    )
    const { result } = renderHook(() => useLlmCallLog({ call_type: 'evaluation', limit: 50 }), { wrapper: makeWrapper() })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(capturedUrl).toContain('call_type=evaluation')
    expect(capturedUrl).toContain('limit=50')
  })

  it('enters error state on failure', async () => {
    server.use(http.get('/api/v1/llm-call-log', () => new HttpResponse(null, { status: 500 })))
    const { result } = renderHook(() => useLlmCallLog(), { wrapper: makeWrapper() })
    await waitFor(() => expect(result.current.isError).toBe(true))
  })
})
