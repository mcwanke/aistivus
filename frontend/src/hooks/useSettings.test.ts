import { describe, it, expect } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createElement } from 'react'
import { http, HttpResponse } from 'msw'
import { server } from '@/test/mocks/server'
import {
  MOCK_SETTINGS,
  MOCK_MODEL,
  MOCK_SYSTEM_TYPES,
  MOCK_JOBSEARCH,
  MOCK_JOBSEARCH_VERSIONS,
} from '@/test/mocks/handlers'
import {
  useSettings,
  useLlmModels,
  useCreateModel,
  useUpdateModel,
  useSetDefaultModel,
  useDeleteModel,
  useSystemTypes,
  useAddSystemType,
  useDeleteSystemType,
  useJobsearch,
  useSaveJobsearch,
  useJobsearchVersions,
  useJobsearchVersionContent,
} from './useSettings'

function makeWrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return ({ children }: { children: React.ReactNode }) =>
    createElement(QueryClientProvider, { client: qc }, children)
}

describe('useSettings', () => {
  it('returns settings on success', async () => {
    const { result } = renderHook(() => useSettings(), { wrapper: makeWrapper() })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toEqual(MOCK_SETTINGS)
  })

  it('enters error state on failure', async () => {
    server.use(http.get('/api/v1/settings', () => new HttpResponse(null, { status: 500 })))
    const { result } = renderHook(() => useSettings(), { wrapper: makeWrapper() })
    await waitFor(() => expect(result.current.isError).toBe(true))
  })
})

describe('useLlmModels', () => {
  it('returns models on success', async () => {
    const { result } = renderHook(() => useLlmModels(), { wrapper: makeWrapper() })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toEqual([MOCK_MODEL])
  })
})

describe('useCreateModel', () => {
  it('mutates and succeeds', async () => {
    const { result } = renderHook(() => useCreateModel(), { wrapper: makeWrapper() })
    result.current.mutate({ model: 'llama3', server_id: 1 })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
  })

  it('enters error state with detail message', async () => {
    server.use(http.post('/api/v1/models', () => HttpResponse.json({ detail: 'Already exists' }, { status: 409 })))
    const { result } = renderHook(() => useCreateModel(), { wrapper: makeWrapper() })
    result.current.mutate({ model: 'llama3', server_id: 1 })
    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(result.current.error?.message).toBe('Already exists')
  })
})

describe('useUpdateModel', () => {
  it('mutates and succeeds', async () => {
    const { result } = renderHook(() => useUpdateModel(), { wrapper: makeWrapper() })
    result.current.mutate({ modelId: 1, updates: { model: 'llama3.1' } })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
  })
})

describe('useSetDefaultModel', () => {
  it('mutates and succeeds', async () => {
    const { result } = renderHook(() => useSetDefaultModel(), { wrapper: makeWrapper() })
    result.current.mutate(1)
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
  })
})

describe('useDeleteModel', () => {
  it('mutates and succeeds', async () => {
    const { result } = renderHook(() => useDeleteModel(), { wrapper: makeWrapper() })
    result.current.mutate(1)
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
  })
})

describe('useSystemTypes', () => {
  it('returns system types on success', async () => {
    const { result } = renderHook(() => useSystemTypes(), { wrapper: makeWrapper() })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toEqual(MOCK_SYSTEM_TYPES)
  })
})

describe('useAddSystemType', () => {
  it('mutates and succeeds', async () => {
    const { result } = renderHook(() => useAddSystemType(), { wrapper: makeWrapper() })
    result.current.mutate({ type_name: 'application_log', type_value: 'custom' })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
  })
})

describe('useDeleteSystemType', () => {
  it('mutates and succeeds', async () => {
    const { result } = renderHook(() => useDeleteSystemType(), { wrapper: makeWrapper() })
    result.current.mutate(1)
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
  })
})

describe('useJobsearch', () => {
  it('returns jobsearch content on success', async () => {
    const { result } = renderHook(() => useJobsearch(), { wrapper: makeWrapper() })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toEqual(MOCK_JOBSEARCH)
  })
})

describe('useSaveJobsearch', () => {
  it('mutates and succeeds', async () => {
    const { result } = renderHook(() => useSaveJobsearch(), { wrapper: makeWrapper() })
    result.current.mutate({ content: '# Updated', note: 'Test save' })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
  })
})

describe('useJobsearchVersions', () => {
  it('returns versions on success', async () => {
    const { result } = renderHook(() => useJobsearchVersions(), { wrapper: makeWrapper() })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toEqual(MOCK_JOBSEARCH_VERSIONS)
  })
})

describe('useJobsearchVersionContent', () => {
  it('fetches version content when versionId is provided', async () => {
    const { result } = renderHook(() => useJobsearchVersionContent(1), { wrapper: makeWrapper() })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toEqual(MOCK_JOBSEARCH)
  })

  it('stays idle when versionId is null', () => {
    const { result } = renderHook(() => useJobsearchVersionContent(null), { wrapper: makeWrapper() })
    expect(result.current.isPending).toBe(true)
    expect(result.current.fetchStatus).toBe('idle')
  })
})
