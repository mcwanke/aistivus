import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import type { LlmModel, ModelsResponse, EvaluateResponse, ScrapeResult, FillGapsPayload, FillGapsResult } from '@/types/api'

// ─── Fetchers ─────────────────────────────────────────────────────────────────

async function fetchModels(): Promise<LlmModel[]> {
  const res = await fetch('/api/v1/models')
  if (!res.ok) throw new Error(`models ${res.status}`)
  const data = (await res.json()) as ModelsResponse
  return data.models
}

// ─── Hooks ────────────────────────────────────────────────────────────────────

export function useModels() {
  return useQuery({ queryKey: ['models'], queryFn: fetchModels })
}

// ─── Evaluate mutation ────────────────────────────────────────────────────────

export interface EvaluatePayload {
  jd_text: string
  company_name: string
  job_title: string
  location: string | null
  remote_type: string | null
  apply_url: string | null
  pay_band: string | null
  llm_model_id: number | null
  force: boolean
}

async function postEvaluate(payload: EvaluatePayload): Promise<EvaluateResponse> {
  const res = await fetch('/api/v1/evaluate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (!res.ok) throw new Error(`evaluate ${res.status}`)
  return res.json() as Promise<EvaluateResponse>
}

export function useEvaluateMutation() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: postEvaluate,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['jobs'] })
    },
  })
}

// ─── Import mutation ──────────────────────────────────────────────────────────

export interface ImportPayload {
  job_id: number
  llm_model_id: number | null
  score_overall: number | null
  score_role_fit: number | null
  score_scope_fit: number | null
  score_culture: number | null
  score_comp: number | null
  fit_type: string | null
  archetype: string | null
  strengths: string | null
  gaps: string | null
  recommendation: string | null
  keywords: string | null
  domain_match: string | null
  role_type_match: string | null
  keyword_gaps: string | null
}

async function postImportEvaluation(
  payload: ImportPayload,
): Promise<{ success: boolean; evaluation_id: number }> {
  const res = await fetch('/api/v1/evaluations/import', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { detail?: string }
    throw new Error(err.detail ?? `import evaluation ${res.status}`)
  }
  return res.json() as Promise<{ success: boolean; evaluation_id: number }>
}

export function useImportEvaluationMutation() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: postImportEvaluation,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['jobs'] })
    },
  })
}

// ─── Scrape mutations ─────────────────────────────────────────────────────────

async function postScrape(url: string): Promise<ScrapeResult> {
  const res = await fetch('/api/v1/scrape', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url }),
  })
  if (!res.ok) throw new Error(`scrape ${res.status}`)
  return res.json() as Promise<ScrapeResult>
}

export function useScrapeMutation() {
  return useMutation({ mutationFn: postScrape })
}

async function postFillGaps(payload: FillGapsPayload): Promise<FillGapsResult> {
  const res = await fetch('/api/v1/scrape/fill-gaps', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (!res.ok) throw new Error(`fill-gaps ${res.status}`)
  return res.json() as Promise<FillGapsResult>
}

export function useFillGapsMutation() {
  return useMutation({ mutationFn: postFillGaps })
}
