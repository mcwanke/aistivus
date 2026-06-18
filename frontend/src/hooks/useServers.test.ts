import { describe, it, expect } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createElement } from 'react'
import { http, HttpResponse } from 'msw'
import { server } from '@/test/mocks/server'
import {
  useServers,
  useCreateServer,
  useUpdateServer,
  useDeleteServer,
  useTestConnection,
  useDetectServer,
  useAvailableModels,
  useAnthropicKeyStatus,
} from './useServers'

function makeWrapper() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return ({ children }: { children: React.ReactNode }) =>
    createElement(QueryClientProvider, { client: qc }, children)
}

// ─── useServers ──────────────────────────────────────────────────────────────

describe('useServers', () => {
  it('returns server list on success', async () => {
    const { result } = renderHook(() => useServers(), { wrapper: makeWrapper() })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toHaveLength(2)
    expect(result.current.data![0].server_name).toBe('Local Ollama')
  })

  it('enters error state on failure', async () => {
    server.use(
      http.get('/api/v1/settings/llm-servers', () => new HttpResponse(null, { status: 500 })),
    )
    const { result } = renderHook(() => useServers(), { wrapper: makeWrapper() })
    await waitFor(() => expect(result.current.isError).toBe(true))
  })

  it('returns both ollama and anthropic servers', async () => {
    const { result } = renderHook(() => useServers(), { wrapper: makeWrapper() })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    const types = result.current.data!.map((s) => s.server_type)
    expect(types).toContain('ollama')
    expect(types).toContain('anthropic')
  })
})

// ─── useCreateServer ─────────────────────────────────────────────────────────

describe('useCreateServer', () => {
  it('mutates and succeeds for local server', async () => {
    const { result } = renderHook(() => useCreateServer(), { wrapper: makeWrapper() })
    result.current.mutate({
      server_name: 'Home Lab',
      endpoint: 'http://192.168.1.10:11434',
      server_type: 'ollama',
    })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
  })

  it('mutates and succeeds for anthropic server', async () => {
    const { result } = renderHook(() => useCreateServer(), { wrapper: makeWrapper() })
    result.current.mutate({ server_name: 'Anthropic Claude', server_type: 'anthropic' })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
  })

  it('enters error state with detail message on 409', async () => {
    server.use(
      http.post('/api/v1/settings/llm-servers', () =>
        HttpResponse.json({ detail: 'An Anthropic server is already configured.' }, { status: 409 }),
      ),
    )
    const { result } = renderHook(() => useCreateServer(), { wrapper: makeWrapper() })
    result.current.mutate({ server_name: 'Duplicate', server_type: 'anthropic' })
    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(result.current.error?.message).toContain('Anthropic server')
  })
})

// ─── useUpdateServer ─────────────────────────────────────────────────────────

describe('useUpdateServer', () => {
  it('mutates and succeeds', async () => {
    const { result } = renderHook(() => useUpdateServer(), { wrapper: makeWrapper() })
    result.current.mutate({
      serverId: 1,
      updates: { server_name: 'Updated Name', endpoint: 'http://localhost:11434' },
    })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
  })

  it('enters error state on 404', async () => {
    server.use(
      http.put('/api/v1/settings/llm-servers/:id', () =>
        HttpResponse.json({ detail: 'Server not found.' }, { status: 404 }),
      ),
    )
    const { result } = renderHook(() => useUpdateServer(), { wrapper: makeWrapper() })
    result.current.mutate({ serverId: 9999, updates: { server_name: 'Ghost' } })
    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(result.current.error?.message).toContain('not found')
  })
})

// ─── useDeleteServer ─────────────────────────────────────────────────────────

describe('useDeleteServer', () => {
  it('mutates and succeeds', async () => {
    const { result } = renderHook(() => useDeleteServer(), { wrapper: makeWrapper() })
    result.current.mutate(1)
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
  })

  it('enters error state with detail message on 409', async () => {
    server.use(
      http.delete('/api/v1/settings/llm-servers/:id', () =>
        HttpResponse.json(
          { detail: 'This server has 2 model(s). Delete or reassign them first.' },
          { status: 409 },
        ),
      ),
    )
    const { result } = renderHook(() => useDeleteServer(), { wrapper: makeWrapper() })
    result.current.mutate(1)
    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(result.current.error?.message).toContain('model(s)')
  })
})

// ─── useTestConnection ────────────────────────────────────────────────────────

describe('useTestConnection', () => {
  it('returns success result for local server', async () => {
    const { result } = renderHook(() => useTestConnection(), { wrapper: makeWrapper() })
    result.current.mutate({ server_type: 'ollama', endpoint: 'http://localhost:11434' })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data?.success).toBe(true)
    expect(result.current.data?.model_count).toBe(2)
  })

  it('returns failure result when connection fails', async () => {
    server.use(
      http.post('/api/v1/settings/llm-servers/test', () =>
        HttpResponse.json({ success: false, error: 'Could not reach Ollama at http://bad:11434.' }),
      ),
    )
    const { result } = renderHook(() => useTestConnection(), { wrapper: makeWrapper() })
    result.current.mutate({ server_type: 'ollama', endpoint: 'http://bad:11434' })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data?.success).toBe(false)
    expect(result.current.data?.error).toBeDefined()
  })
})

// ─── useDetectServer ──────────────────────────────────────────────────────────

describe('useDetectServer', () => {
  it('returns detected_type ollama when server speaks Ollama protocol', async () => {
    const { result } = renderHook(() => useDetectServer(), { wrapper: makeWrapper() })
    result.current.mutate({ url: 'http://192.168.1.10:11434' })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data?.detected_type).toBe('ollama')
    expect(result.current.data?.reachable).toBe(true)
  })

  it('returns detected_type openai-compat when server speaks OpenAI protocol', async () => {
    server.use(
      http.post('/api/v1/servers/detect', () =>
        HttpResponse.json({ detected_type: 'openai-compat', reachable: true }),
      ),
    )
    const { result } = renderHook(() => useDetectServer(), { wrapper: makeWrapper() })
    result.current.mutate({ url: 'http://192.168.1.10:8080' })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data?.detected_type).toBe('openai-compat')
    expect(result.current.data?.reachable).toBe(true)
  })

  it('returns reachable false when server is unreachable', async () => {
    server.use(
      http.post('/api/v1/servers/detect', () =>
        HttpResponse.json({ detected_type: null, reachable: false }),
      ),
    )
    const { result } = renderHook(() => useDetectServer(), { wrapper: makeWrapper() })
    result.current.mutate({ url: 'http://10.0.0.99:11434' })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data?.detected_type).toBeNull()
    expect(result.current.data?.reachable).toBe(false)
  })

  it('enters error state on non-ok response', async () => {
    server.use(
      http.post('/api/v1/servers/detect', () =>
        HttpResponse.json({ detail: 'URL must start with http://' }, { status: 422 }),
      ),
    )
    const { result } = renderHook(() => useDetectServer(), { wrapper: makeWrapper() })
    result.current.mutate({ url: 'ftp://bad-url' })
    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(result.current.error?.message).toContain('http://')
  })
})

// ─── useAvailableModels ───────────────────────────────────────────────────────

describe('useAvailableModels', () => {
  it('fetches model list when serverId is provided', async () => {
    const { result } = renderHook(() => useAvailableModels(1), { wrapper: makeWrapper() })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data?.models).toContain('llama3:8b')
  })

  it('stays idle when serverId is null', () => {
    const { result } = renderHook(() => useAvailableModels(null), { wrapper: makeWrapper() })
    expect(result.current.isPending).toBe(true)
    expect(result.current.fetchStatus).toBe('idle')
  })

  it('enters error state on failure', async () => {
    server.use(
      http.get('/api/v1/settings/llm-servers/:id/available-models', () =>
        new HttpResponse(null, { status: 503 }),
      ),
    )
    const { result } = renderHook(() => useAvailableModels(1), { wrapper: makeWrapper() })
    await waitFor(() => expect(result.current.isError).toBe(true))
  })
})

// ─── useAnthropicKeyStatus ────────────────────────────────────────────────────

describe('useAnthropicKeyStatus', () => {
  it('returns key_present: false by default', async () => {
    const { result } = renderHook(() => useAnthropicKeyStatus(), { wrapper: makeWrapper() })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data?.anthropic_key_present).toBe(false)
  })

  it('returns key_present: true when key is set', async () => {
    server.use(
      http.get('/api/v1/settings/anthropic-key', () =>
        HttpResponse.json({ anthropic_key_present: true }),
      ),
    )
    const { result } = renderHook(() => useAnthropicKeyStatus(), { wrapper: makeWrapper() })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data?.anthropic_key_present).toBe(true)
  })

  it('enters error state on failure', async () => {
    server.use(
      http.get('/api/v1/settings/anthropic-key', () => new HttpResponse(null, { status: 500 })),
    )
    const { result } = renderHook(() => useAnthropicKeyStatus(), { wrapper: makeWrapper() })
    await waitFor(() => expect(result.current.isError).toBe(true))
  })
})
