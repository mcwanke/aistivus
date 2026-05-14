import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import type { ApplicationListItem, ApplicationDetailResponse } from '@/types/api'

// ─── Fetchers ─────────────────────────────────────────────────────────────────

async function fetchApplications(): Promise<ApplicationListItem[]> {
  const res = await fetch('/api/v1/applications')
  if (!res.ok) throw new Error(`applications ${res.status}`)
  return res.json() as Promise<ApplicationListItem[]>
}

async function fetchApplicationDetail(id: number): Promise<ApplicationDetailResponse> {
  const res = await fetch(`/api/v1/applications/${id}`)
  if (!res.ok) throw new Error(`application ${id} ${res.status}`)
  return res.json() as Promise<ApplicationDetailResponse>
}

// ─── Hooks ────────────────────────────────────────────────────────────────────

export function useApplications() {
  return useQuery({ queryKey: ['applications'], queryFn: fetchApplications })
}

export function useApplicationDetail(id: number | undefined) {
  return useQuery({
    queryKey: ['application', id],
    queryFn: () => fetchApplicationDetail(id!),
    enabled: id !== undefined,
  })
}

// ─── Mutations ────────────────────────────────────────────────────────────────

interface PatchApplicationPayload {
  applicationId: number
  updates: {
    application_status?: string
    apply_date?: string
    end_date?: string
    requested_salary?: string
  }
}

export function usePatchApplication() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ applicationId, updates }: PatchApplicationPayload) => {
      const res = await fetch(`/api/v1/applications/${applicationId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      })
      if (!res.ok) throw new Error(`patch application ${applicationId} ${res.status}`)
    },
    onSuccess: (_data, { applicationId }) => {
      void qc.invalidateQueries({ queryKey: ['applications'] })
      void qc.invalidateQueries({ queryKey: ['application', applicationId] })
    },
  })
}

interface AddLogPayload {
  applicationId: number
  type_value: string
  log: string
  url?: string
  log_timestamp?: string
}

export function useAddLog() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ applicationId, ...body }: AddLogPayload) => {
      const res = await fetch(`/api/v1/applications/${applicationId}/logs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) throw new Error(`add log ${res.status}`)
    },
    onSuccess: (_data, { applicationId }) => {
      void qc.invalidateQueries({ queryKey: ['application', applicationId] })
    },
  })
}

interface DeleteLogPayload {
  applicationId: number
  logId: number
}

export function useDeleteLog() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ applicationId, logId }: DeleteLogPayload) => {
      const res = await fetch(`/api/v1/applications/${applicationId}/logs/${logId}`, {
        method: 'DELETE',
      })
      if (!res.ok) throw new Error(`delete log ${logId} ${res.status}`)
    },
    onSuccess: (_data, { applicationId }) => {
      void qc.invalidateQueries({ queryKey: ['application', applicationId] })
    },
  })
}

export function useGeneratePrompt() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (applicationId: number): Promise<{ prompt: string; log_id: number }> => {
      const res = await fetch(`/api/v1/applications/${applicationId}/generate-prompt`, {
        method: 'POST',
      })
      if (!res.ok) throw new Error(`generate prompt ${res.status}`)
      return res.json() as Promise<{ prompt: string; log_id: number }>
    },
    onSuccess: (_data, applicationId) => {
      void qc.invalidateQueries({ queryKey: ['application', applicationId] })
    },
  })
}
