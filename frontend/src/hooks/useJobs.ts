import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import type { Job, JobListItem, JobDetailResponse, ActivityLogResponse } from '@/types/api'

export type { JobDetailResponse }

// ─── Fetchers ─────────────────────────────────────────────────────────────────

async function fetchJobs(): Promise<JobListItem[]> {
  const res = await fetch('/api/v1/jobs')
  if (!res.ok) throw new Error(`jobs ${res.status}`)
  return res.json() as Promise<JobListItem[]>
}

async function fetchJobDetail(jobId: number): Promise<JobDetailResponse> {
  const res = await fetch(`/api/v1/jobs/${jobId}`)
  if (!res.ok) throw new Error(`job ${jobId} ${res.status}`)
  return res.json() as Promise<JobDetailResponse>
}

// ─── Hooks ────────────────────────────────────────────────────────────────────

export function useJobs() {
  return useQuery({ queryKey: ['jobs'], queryFn: fetchJobs })
}

export function useJobDetail(jobId: number | undefined) {
  return useQuery({
    queryKey: ['job', jobId],
    queryFn: () => fetchJobDetail(jobId!),
    enabled: jobId !== undefined,
  })
}

export function useActivityLog(jobId: number | undefined) {
  return useQuery({
    queryKey: ['activity-log', jobId],
    queryFn: async () => {
      const res = await fetch(`/api/v1/jobs/${jobId!}/activity-log`)
      if (!res.ok) throw new Error(`activity-log ${res.status}`)
      return res.json() as Promise<ActivityLogResponse>
    },
    enabled: jobId !== undefined,
  })
}

// ─── Mutations ────────────────────────────────────────────────────────────────

interface PatchJobPayload {
  jobId: number
  updates: {
    company_name?: string
    title?: string
    location?: string
    remote_type?: string
    description_merged?: string
    pay_band?: string | null
    role_keyword?: string | null
    excitement_level?: string
    my_role_fit?: number | null
    my_scope_fit?: number | null
    my_culture?: number | null
    my_comp?: number | null
    my_score_overall?: number | null
  }
}

export function usePatchJob() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ jobId, updates }: PatchJobPayload) => {
      const res = await fetch(`/api/v1/jobs/${jobId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      })
      if (!res.ok) throw new Error(`patch job ${jobId} ${res.status}`)
    },
    onSuccess: (_data, { jobId }) => {
      void qc.invalidateQueries({ queryKey: ['jobs'] })
      void qc.invalidateQueries({ queryKey: ['job', jobId] })
    },
  })
}

interface AddCompanyLogPayload {
  jobId: number
  type_value: string
  log?: string
  url?: string
}

export function useAddCompanyLog() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ jobId, type_value, log, url }: AddCompanyLogPayload) => {
      const res = await fetch(`/api/v1/jobs/${jobId}/company-log`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type_value, log, url }),
      })
      if (!res.ok) throw new Error(`add company log ${res.status}`)
    },
    onSuccess: (_data, { jobId }) => {
      void qc.invalidateQueries({ queryKey: ['job', jobId] })
      void qc.invalidateQueries({ queryKey: ['activity-log', jobId] })
    },
  })
}

export function useUpdateCompanySummary() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ jobId, text }: { jobId: number; text: string }) => {
      const res = await fetch(`/api/v1/jobs/${jobId}/company-summary`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      })
      if (!res.ok) throw new Error(`update company summary ${res.status}`)
    },
    onSuccess: (_data, { jobId }) => {
      void qc.invalidateQueries({ queryKey: ['job', jobId] })
    },
  })
}

export function useActivateJob() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (jobId: number) =>
      fetch(`/api/v1/jobs/${jobId}/activate`, { method: 'POST' }).then((r) => {
        if (!r.ok) throw new Error('Failed to activate job')
        return r.json() as Promise<Job>
      }),
    onSuccess: (_data, jobId) => {
      void qc.invalidateQueries({ queryKey: ['jobs'] })
      void qc.invalidateQueries({ queryKey: ['job', jobId] })
      void qc.invalidateQueries({ queryKey: ['activity-log', jobId] })
    },
  })
}

export function useStartApplication() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (jobId: number) => {
      const res = await fetch('/api/v1/applications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ job_id: jobId }),
      })
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { detail?: string }
        throw new Error(err.detail ?? `start application ${res.status}`)
      }
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['jobs'] })
    },
  })
}

