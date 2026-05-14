import { useQuery } from '@tanstack/react-query'
import type { LlmCallLogEntry } from '@/types/api'

export interface LlmCallLogParams {
  job_id?: number | null
  call_type?: string | null
  limit?: number
}

async function fetchLlmCallLog(params: LlmCallLogParams): Promise<LlmCallLogEntry[]> {
  const qs = new URLSearchParams()
  if (params.job_id != null) qs.set('job_id', String(params.job_id))
  if (params.call_type) qs.set('call_type', params.call_type)
  if (params.limit) qs.set('limit', String(params.limit))
  const url = `/api/v1/llm-call-log${qs.toString() ? `?${qs.toString()}` : ''}`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`llm-call-log ${res.status}`)
  return res.json() as Promise<LlmCallLogEntry[]>
}

export function useLlmCallLog(params: LlmCallLogParams = {}) {
  return useQuery({
    queryKey: ['llm-call-log', params],
    queryFn: () => fetchLlmCallLog(params),
  })
}
