import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import type { Org, CreateOrgPayload, CreateOrgResult, JobResearch, OrgCrawl, OrgCrawlLog } from '@/types/api'

// ─── Fetchers ─────────────────────────────────────────────────────────────────

async function fetchOrgs(): Promise<Org[]> {
  const res = await fetch('/api/v1/orgs')
  if (!res.ok) throw new Error(`orgs ${res.status}`)
  return res.json() as Promise<Org[]>
}

async function fetchOrgDetail(orgId: number): Promise<Org> {
  const res = await fetch(`/api/v1/orgs/${orgId}`)
  if (!res.ok) throw new Error(`org ${orgId} ${res.status}`)
  return res.json() as Promise<Org>
}

async function fetchOrgResearch(orgId: number): Promise<JobResearch | null> {
  const res = await fetch(`/api/v1/orgs/${orgId}/research`)
  if (!res.ok) throw new Error(`org research ${orgId} ${res.status}`)
  const data = (await res.json()) as { research: JobResearch | null }
  return data.research
}

async function fetchOrgCrawls(orgId: number): Promise<OrgCrawl[]> {
  const res = await fetch(`/api/v1/orgs/${orgId}/crawls`)
  if (!res.ok) throw new Error(`org crawls ${orgId} ${res.status}`)
  return res.json() as Promise<OrgCrawl[]>
}

async function fetchCrawlLogs(orgId: number, crawlId: number): Promise<OrgCrawlLog[]> {
  const res = await fetch(`/api/v1/orgs/${orgId}/crawls/${crawlId}/logs`)
  if (!res.ok) throw new Error(`crawl logs ${crawlId} ${res.status}`)
  return res.json() as Promise<OrgCrawlLog[]>
}

// ─── Hooks ────────────────────────────────────────────────────────────────────

export function useOrgs() {
  return useQuery({ queryKey: ['orgs'], queryFn: fetchOrgs })
}

export function useOrgDetail(orgId: number | undefined) {
  return useQuery({
    queryKey: ['org', orgId],
    queryFn: () => fetchOrgDetail(orgId!),
    enabled: orgId !== undefined,
  })
}

export function useOrgResearch(orgId: number) {
  return useQuery({
    queryKey: ['org-research', orgId],
    queryFn: () => fetchOrgResearch(orgId),
  })
}

export function useOrgCrawls(orgId: number) {
  return useQuery({
    queryKey: ['org-crawls', orgId],
    queryFn: () => fetchOrgCrawls(orgId),
  })
}

export function useCrawlLogs(orgId: number, crawlId: number | null) {
  return useQuery({
    queryKey: ['crawl-logs', crawlId],
    queryFn: () => fetchCrawlLogs(orgId, crawlId!),
    enabled: crawlId !== null,
  })
}

// ─── Mutations ────────────────────────────────────────────────────────────────

export function useCreateOrg() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (payload: CreateOrgPayload): Promise<CreateOrgResult> => {
      const res = await fetch('/api/v1/orgs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { detail?: string }
        throw new Error(err.detail ?? `create org ${res.status}`)
      }
      return res.json() as Promise<CreateOrgResult>
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['orgs'] })
    },
  })
}

export function useGenerateOrgResearchPrompt(orgId: number) {
  return useMutation({
    mutationFn: async (): Promise<{ prompt: string; prompt_usage_id: number | null }> => {
      const res = await fetch(`/api/v1/orgs/${orgId}/generate-research-prompt`, {
        method: 'POST',
      })
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { detail?: string }
        throw new Error(err.detail ?? `generate org research prompt ${res.status}`)
      }
      return res.json() as Promise<{ prompt: string; prompt_usage_id: number | null }>
    },
  })
}

export function useImportOrgResearch(orgId: number) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (rawJson: string): Promise<JobResearch> => {
      const res = await fetch(`/api/v1/orgs/${orgId}/research`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ raw_json: rawJson }),
      })
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { detail?: string }
        throw new Error(err.detail ?? `import org research ${res.status}`)
      }
      const data = (await res.json()) as { research: JobResearch }
      return data.research
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['org-research', orgId] })
    },
  })
}

export function useExportOrgCrawls(orgId: number) {
  return useMutation({
    mutationFn: async (): Promise<{ success: boolean; filename: string }> => {
      const res = await fetch(`/api/v1/orgs/${orgId}/crawls/export`, {
        method: 'POST',
      })
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { detail?: string }
        throw new Error(err.detail ?? `export org crawls ${res.status}`)
      }
      return res.json() as Promise<{ success: boolean; filename: string }>
    },
  })
}

export function useExportCrawlLogs(orgId: number, crawlId: number) {
  return useMutation({
    mutationFn: async (): Promise<{ success: boolean; filename: string }> => {
      const res = await fetch(`/api/v1/orgs/${orgId}/crawls/${crawlId}/logs/export`, {
        method: 'POST',
      })
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { detail?: string }
        throw new Error(err.detail ?? `export crawl logs ${res.status}`)
      }
      return res.json() as Promise<{ success: boolean; filename: string }>
    },
  })
}
