import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import type { ApplicationListItem, ApplicationDetailResponse, AppSetting } from '@/types/api'

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
    applied?: number
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
    mutationFn: async (applicationId: number): Promise<{ prompt: string; log_id: number; prompt_usage_id: number }> => {
      const res = await fetch(`/api/v1/applications/${applicationId}/generate-prompt`, {
        method: 'POST',
      })
      if (!res.ok) throw new Error(`generate prompt ${res.status}`)
      return res.json() as Promise<{ prompt: string; log_id: number; prompt_usage_id: number }>
    },
    onSuccess: (_data, applicationId) => {
      void qc.invalidateQueries({ queryKey: ['application', applicationId] })
    },
  })
}

export function useGenerateResumePrompt() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (applicationId: number): Promise<{ prompt: string; log_id: number }> => {
      const res = await fetch(`/api/v1/applications/${applicationId}/generate-resume-prompt`, {
        method: 'POST',
      })
      if (!res.ok) throw new Error(`generate resume prompt ${res.status}`)
      return res.json() as Promise<{ prompt: string; log_id: number }>
    },
    onSuccess: (_data, applicationId) => {
      void qc.invalidateQueries({ queryKey: ['application', applicationId] })
    },
  })
}

export function useGenerateCoverPrompt() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (applicationId: number): Promise<{ prompt: string; log_id: number }> => {
      const res = await fetch(`/api/v1/applications/${applicationId}/generate-cover-prompt`, {
        method: 'POST',
      })
      if (!res.ok) throw new Error(`generate cover prompt ${res.status}`)
      return res.json() as Promise<{ prompt: string; log_id: number }>
    },
    onSuccess: (_data, applicationId) => {
      void qc.invalidateQueries({ queryKey: ['application', applicationId] })
    },
  })
}

interface PatchLogTimestampPayload {
  applicationId: number
  logId: number
  timestamp: string
}

export function usePatchLogTimestamp() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ applicationId, logId, timestamp }: PatchLogTimestampPayload) => {
      const res = await fetch(
        `/api/v1/applications/${applicationId}/logs/${logId}/timestamp`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ timestamp }),
        },
      )
      if (!res.ok) throw new Error(`patch log timestamp ${res.status}`)
    },
    onSuccess: (_data, { applicationId }) => {
      void qc.invalidateQueries({ queryKey: ['application', applicationId] })
    },
  })
}

interface PatchAuditTimestampPayload {
  applicationId: number
  auditId: number
  timestamp: string
}

export function usePatchAuditTimestamp() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ applicationId, auditId, timestamp }: PatchAuditTimestampPayload) => {
      const res = await fetch(
        `/api/v1/applications/${applicationId}/audit/${auditId}/timestamp`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ timestamp }),
        },
      )
      if (!res.ok) throw new Error(`patch audit timestamp ${res.status}`)
    },
    onSuccess: (_data, { applicationId }) => {
      void qc.invalidateQueries({ queryKey: ['application', applicationId] })
    },
  })
}

// ─── App settings ─────────────────────────────────────────────────────────────

async function fetchAppSettings(): Promise<AppSetting[]> {
  const res = await fetch('/api/v1/settings/app')
  if (!res.ok) throw new Error(`app settings ${res.status}`)
  return res.json() as Promise<AppSetting[]>
}

export function useAppSettings() {
  return useQuery({ queryKey: ['app-settings'], queryFn: fetchAppSettings })
}

interface PatchAppSettingPayload {
  key: string
  value: string
}

export function usePatchAppSetting() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ key, value }: PatchAppSettingPayload) => {
      const res = await fetch(`/api/v1/settings/app/${encodeURIComponent(key)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value }),
      })
      if (!res.ok) throw new Error(`patch app setting ${res.status}`)
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['app-settings'] })
    },
  })
}
