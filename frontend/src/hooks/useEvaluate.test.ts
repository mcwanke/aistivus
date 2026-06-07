import { describe, it, expect } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createElement } from 'react'
import { http, HttpResponse } from 'msw'
import { server } from '@/test/mocks/server'
import { MOCK_MODEL, MOCK_EVALUATE_RESPONSE } from '@/test/mocks/handlers'
import { useModels, useEvaluateMutation, useImportEvaluationMutation } from './useEvaluate'

function makeWrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return ({ children }: { children: React.ReactNode }) =>
    createElement(QueryClientProvider, { client: qc }, children)
}

describe('useModels', () => {
  it('returns models list on success', async () => {
    const { result } = renderHook(() => useModels(), { wrapper: makeWrapper() })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toEqual([MOCK_MODEL])
  })

  it('enters error state on failure', async () => {
    server.use(http.get('/api/v1/models', () => new HttpResponse(null, { status: 500 })))
    const { result } = renderHook(() => useModels(), { wrapper: makeWrapper() })
    await waitFor(() => expect(result.current.isError).toBe(true))
  })
})

describe('useEvaluateMutation', () => {
  it('posts evaluation and returns success response', async () => {
    const { result } = renderHook(() => useEvaluateMutation(), { wrapper: makeWrapper() })
    result.current.mutate({
      jd_text: 'We are looking for an engineer.',
      company_name: 'Acme',
      job_title: 'Engineer',
      location: null,
      remote_type: null,
      apply_url: null,
      pay_band: null,
      llm_model_id: 1,
      force: false,
    })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toEqual(MOCK_EVALUATE_RESPONSE)
  })

  it('enters error state on failure', async () => {
    server.use(http.post('/api/v1/evaluate', () => new HttpResponse(null, { status: 500 })))
    const { result } = renderHook(() => useEvaluateMutation(), { wrapper: makeWrapper() })
    result.current.mutate({
      jd_text: 'Job description.',
      company_name: 'Acme',
      job_title: 'Engineer',
      location: null,
      remote_type: null,
      apply_url: null,
      pay_band: null,
      llm_model_id: 1,
      force: false,
    })
    await waitFor(() => expect(result.current.isError).toBe(true))
  })
})

describe('useImportEvaluationMutation', () => {
  it('posts import and returns success response', async () => {
    const { result } = renderHook(() => useImportEvaluationMutation(), { wrapper: makeWrapper() })
    result.current.mutate({
      job_id: 1,
      llm_model_id: 1,
      score_overall: 8,
      score_role_fit: 4,
      score_scope_fit: 4,
      score_culture: 4,
      score_comp: 3,
      fit_type: 'Core Fit',
      archetype: 'Technical Specialist',
      strengths: 'Strong background',
      gaps: 'Missing X',
      recommendation: 'Apply',
      keywords: 'Python, FastAPI',
      domain_match: 'Same domain',
      role_type_match: 'Target match',
      keyword_gaps: 'Docker',
    })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toEqual({ success: true, evaluation_id: 1 })
  })

  it('enters error state with detail message on failure', async () => {
    server.use(
      http.post('/api/v1/evaluations/import', () =>
        HttpResponse.json({ detail: 'Import failed' }, { status: 422 }),
      ),
    )
    const { result } = renderHook(() => useImportEvaluationMutation(), { wrapper: makeWrapper() })
    result.current.mutate({
      job_id: 1,
      llm_model_id: null,
      score_overall: null,
      score_role_fit: null,
      score_scope_fit: null,
      score_culture: null,
      score_comp: null,
      fit_type: null,
      archetype: null,
      strengths: null,
      gaps: null,
      recommendation: null,
      keywords: null,
      domain_match: null,
      role_type_match: null,
      keyword_gaps: null,
    })
    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(result.current.error?.message).toBe('Import failed')
  })
})
