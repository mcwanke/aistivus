import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import type {
  LlmModel,
  ModelsResponse,
  SettingsResponse,
  SystemType,
  JobsearchContent,
  ResumeTemplateContent,
} from '@/types/api'

// ─── Settings ─────────────────────────────────────────────────────────────────

async function fetchSettings(): Promise<SettingsResponse> {
  const res = await fetch('/api/v1/settings')
  if (!res.ok) throw new Error(`settings ${res.status}`)
  return res.json() as Promise<SettingsResponse>
}

export function useSettings() {
  return useQuery({ queryKey: ['settings'], queryFn: fetchSettings })
}

// ─── LLM Models ───────────────────────────────────────────────────────────────

async function fetchModels(): Promise<LlmModel[]> {
  const res = await fetch('/api/v1/models')
  if (!res.ok) throw new Error(`models ${res.status}`)
  const data = (await res.json()) as ModelsResponse
  return data.models
}

export function useLlmModels() {
  return useQuery({ queryKey: ['models'], queryFn: fetchModels })
}

export interface CreateModelPayload {
  model: string
  endpoint: string
  model_weight?: number
  estimated_eval_time?: number | null
}

export function useCreateModel() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (payload: CreateModelPayload) => {
      const res = await fetch('/api/v1/models', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { detail?: string }
        throw new Error(err.detail ?? `create model ${res.status}`)
      }
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['models'] }),
  })
}

export interface UpdateModelPayload {
  modelId: number
  updates: {
    model?: string
    endpoint?: string
    model_weight?: number
    estimated_eval_time?: number | null
    enabled?: number
  }
}

export function useUpdateModel() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ modelId, updates }: UpdateModelPayload) => {
      const res = await fetch(`/api/v1/models/${modelId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      })
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { detail?: string }
        throw new Error(err.detail ?? `update model ${res.status}`)
      }
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['models'] }),
  })
}

export function useSetDefaultModel() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (modelId: number) => {
      const res = await fetch(`/api/v1/models/${modelId}/set-default`, {
        method: 'POST',
      })
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { detail?: string }
        throw new Error(err.detail ?? `set default model ${res.status}`)
      }
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['models'] }),
  })
}

export function useDeleteModel() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (modelId: number) => {
      const res = await fetch(`/api/v1/models/${modelId}`, { method: 'DELETE' })
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { detail?: string }
        throw new Error(err.detail ?? `delete model ${res.status}`)
      }
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['models'] }),
  })
}

export function useCheckAvailability() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/v1/models/check-availability', { method: 'POST' })
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { detail?: string }
        throw new Error(err.detail ?? `check availability ${res.status}`)
      }
      return res.json() as Promise<{ checked: number; available: number }>
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['models'] }),
  })
}

// ─── System Types ─────────────────────────────────────────────────────────────

async function fetchSystemTypes(): Promise<SystemType[]> {
  const res = await fetch('/api/v1/system-types')
  if (!res.ok) throw new Error(`system-types ${res.status}`)
  return res.json() as Promise<SystemType[]>
}

export function useSystemTypes() {
  return useQuery({ queryKey: ['system-types'], queryFn: fetchSystemTypes })
}

export interface AddSystemTypePayload {
  type_name: string
  type_value: string
}

export function useAddSystemType() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (payload: AddSystemTypePayload) => {
      const res = await fetch('/api/v1/system-types', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { detail?: string }
        throw new Error(err.detail ?? `add system-type ${res.status}`)
      }
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['system-types'] }),
  })
}

export function useDeleteSystemType() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (typeId: number) => {
      const res = await fetch(`/api/v1/system-types/${typeId}`, { method: 'DELETE' })
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { detail?: string }
        throw new Error(err.detail ?? `delete system-type ${res.status}`)
      }
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['system-types'] }),
  })
}

// ─── jobsearch.md ─────────────────────────────────────────────────────────────

async function fetchJobsearch(): Promise<JobsearchContent> {
  const res = await fetch('/api/v1/settings/jobsearch')
  if (!res.ok) throw new Error(`jobsearch ${res.status}`)
  return res.json() as Promise<JobsearchContent>
}

export function useJobsearch() {
  return useQuery({ queryKey: ['jobsearch'], queryFn: fetchJobsearch })
}

export function useSaveJobsearch() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (payload: { content: string; note?: string }) => {
      const res = await fetch('/api/v1/settings/jobsearch', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { detail?: string }
        throw new Error(err.detail ?? `save jobsearch ${res.status}`)
      }
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['jobsearch'] })
      void qc.invalidateQueries({ queryKey: ['jobsearch-versions'] })
    },
  })
}

export function useJobsearchVersionContent(versionId: number | null) {
  return useQuery({
    queryKey: ['jobsearch-version', versionId],
    queryFn: async () => {
      const res = await fetch(`/api/v1/settings/jobsearch/versions/${versionId}`)
      if (!res.ok) throw new Error(`jobsearch version ${versionId} ${res.status}`)
      return (res.json() as Promise<JobsearchContent>)
    },
    enabled: versionId !== null,
  })
}

export function useJobsearchBackup() {
  return useQuery({
    queryKey: ['jobsearch-backup'],
    queryFn: async () => {
      const res = await fetch('/api/v1/settings/jobsearch/backup')
      if (!res.ok) throw new Error(`jobsearch backup ${res.status}`)
      return res.json() as Promise<{ content: string }>
    },
    enabled: false,
  })
}

export function useResumeTemplate() {
  return useQuery({
    queryKey: ['resume-template'],
    queryFn: async () => {
      const res = await fetch('/api/v1/settings/resume-template')
      if (!res.ok) throw new Error(`resume-template ${res.status}`)
      return res.json() as Promise<ResumeTemplateContent>
    },
  })
}

export function useSaveResumeTemplate() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (payload: { content: string }) => {
      const res = await fetch('/api/v1/settings/resume-template', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { detail?: string }
        throw new Error(err.detail ?? `save resume-template ${res.status}`)
      }
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['resume-template'] }),
  })
}

export function useResumeTemplateBackup() {
  return useQuery({
    queryKey: ['resume-template-backup'],
    queryFn: async () => {
      const res = await fetch('/api/v1/settings/resume-template/backup')
      if (!res.ok) throw new Error(`resume-template backup ${res.status}`)
      return res.json() as Promise<{ content: string }>
    },
    enabled: false,
  })
}
