import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import type { LlmModel, ModelsResponse, EvaluateResponse, ScrapeResult, FillGapsPayload, FillGapsResult, CreateJobPayload, CreateJobResult, PromptUsageFeedbackPayload } from '@/types/api'

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
  rerun_job_id?: number
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
      void qc.invalidateQueries({ queryKey: ['models'] })
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
  score_ats: number | null
  score_recruiter_fast: number | null
  score_recruiter_deep: number | null
  score_candidate_role: number | null
  score_candidate_scope: number | null
  score_candidate_culture: number | null
  fit_type: string | null
  archetype: string | null
  strengths: string | null
  gaps: string | null
  recommendation: string | null
  keywords: string | null
  domain_match: string | null
  role_type_match: string | null
  keyword_gaps: string | null
  interview_prep_notes: string | null
  research_confidence: string | null
  score_reasons: string | null
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

// ─── Create job without eval mutation ────────────────────────────────────────

async function postCreateJob(payload: CreateJobPayload): Promise<CreateJobResult> {
  const res = await fetch('/api/v1/jobs/create', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (!res.ok) throw new Error(`create-job ${res.status}`)
  return res.json() as Promise<CreateJobResult>
}

export function useCreateJobMutation() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: postCreateJob,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['jobs'] })
    },
  })
}

// ─── Internal eval SSE hook ───────────────────────────────────────────────────

export interface InternalEvalEvent {
  event: 'step_start' | 'step_complete' | 'done' | 'error'
  step?: number
  total?: number
  label?: string
  eval_id?: number
  message?: string
}

export function useRunInternalEval(jobId: number) {
  const qc = useQueryClient()

  async function run(
    llmModelId: number | null,
    onEvent: (evt: InternalEvalEvent) => void,
  ): Promise<void> {
    const res = await fetch(`/api/v1/jobs/${jobId}/eval/internal`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ llm_model_id: llmModelId }),
    })
    if (!res.ok || !res.body) {
      onEvent({ event: 'error', message: `Request failed: ${res.status}` })
      return
    }

    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''
      for (const line of lines) {
        if (!line.startsWith('data: ')) continue
        try {
          const evt = JSON.parse(line.slice(6)) as InternalEvalEvent
          onEvent(evt)
          if (evt.event === 'done') {
            void qc.invalidateQueries({ queryKey: ['job', jobId] })
            void qc.invalidateQueries({ queryKey: ['jobs'] })
          }
        } catch {
          // malformed SSE line — skip
        }
      }
    }
  }

  return { run }
}

// ─── Prompt usage feedback mutation ──────────────────────────────────────────

async function postPromptUsageFeedback({
  promptUsageId,
  payload,
}: {
  promptUsageId: number
  payload: PromptUsageFeedbackPayload
}): Promise<{ success: boolean }> {
  const res = await fetch(`/api/v1/prompt-usage/${promptUsageId}/feedback`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (!res.ok) throw new Error(`prompt-usage feedback ${res.status}`)
  return res.json() as Promise<{ success: boolean }>
}

export function useSubmitPromptUsageFeedback() {
  return useMutation({ mutationFn: postPromptUsageFeedback })
}
