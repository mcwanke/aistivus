import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import type {
  LlmServer,
  ConnectionTestResult,
  AvailableModelsResponse,
  AnthropicKeyStatus,
  ServerType,
  ServerDetectResponse,
} from '@/types/api'

// ─── Queries ──────────────────────────────────────────────────────────────────

async function fetchServers(): Promise<LlmServer[]> {
  const res = await fetch('/api/v1/settings/llm-servers')
  if (!res.ok) throw new Error(`servers ${res.status}`)
  const data = (await res.json()) as { servers: LlmServer[] }
  return data.servers
}

export function useServers() {
  return useQuery({
    queryKey: ['servers'],
    queryFn: fetchServers,
    staleTime: 30_000,
  })
}

export function useAvailableModels(serverId: number | null) {
  return useQuery({
    queryKey: ['available-models', serverId],
    queryFn: async () => {
      const res = await fetch(`/api/v1/settings/llm-servers/${serverId}/available-models`)
      if (!res.ok) throw new Error(`available-models ${res.status}`)
      return res.json() as Promise<AvailableModelsResponse>
    },
    enabled: serverId !== null,
    staleTime: 30_000,
  })
}

export function useAnthropicKeyStatus() {
  return useQuery({
    queryKey: ['anthropic-key'],
    queryFn: async () => {
      const res = await fetch('/api/v1/settings/anthropic-key')
      if (!res.ok) throw new Error(`anthropic-key ${res.status}`)
      return res.json() as Promise<AnthropicKeyStatus>
    },
  })
}

// ─── Mutations ────────────────────────────────────────────────────────────────

export interface CreateServerPayload {
  server_name: string
  endpoint?: string | null
  server_type: ServerType
}

export function useCreateServer() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (payload: CreateServerPayload) => {
      const res = await fetch('/api/v1/settings/llm-servers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { detail?: string }
        throw new Error(err.detail ?? `create server ${res.status}`)
      }
      return res.json() as Promise<LlmServer>
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['servers'] })
      void qc.invalidateQueries({ queryKey: ['models'] })
    },
  })
}

export interface UpdateServerPayload {
  serverId: number
  updates: {
    server_name: string
    endpoint?: string | null
  }
}

export function useUpdateServer() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ serverId, updates }: UpdateServerPayload) => {
      const res = await fetch(`/api/v1/settings/llm-servers/${serverId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      })
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { detail?: string }
        throw new Error(err.detail ?? `update server ${res.status}`)
      }
      return res.json() as Promise<LlmServer>
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['servers'] })
      void qc.invalidateQueries({ queryKey: ['models'] })
    },
  })
}

export function useDeleteServer() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (serverId: number) => {
      const res = await fetch(`/api/v1/settings/llm-servers/${serverId}`, {
        method: 'DELETE',
      })
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { detail?: string }
        throw new Error(err.detail ?? `delete server ${res.status}`)
      }
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['servers'] })
      void qc.invalidateQueries({ queryKey: ['models'] })
    },
  })
}

export interface TestConnectionPayload {
  server_type: ServerType
  endpoint?: string | null
}

export function useTestConnection() {
  return useMutation({
    mutationFn: async (payload: TestConnectionPayload) => {
      const res = await fetch('/api/v1/settings/llm-servers/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { detail?: string }
        throw new Error(err.detail ?? `test connection ${res.status}`)
      }
      return res.json() as Promise<ConnectionTestResult>
    },
  })
}

export interface DetectServerPayload {
  url: string
}

export function useDetectServer() {
  return useMutation({
    mutationFn: async (payload: DetectServerPayload) => {
      const res = await fetch('/api/v1/servers/detect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { detail?: string }
        throw new Error(err.detail ?? `detect server ${res.status}`)
      }
      return res.json() as Promise<ServerDetectResponse>
    },
  })
}
