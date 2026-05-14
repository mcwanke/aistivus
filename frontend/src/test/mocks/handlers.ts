import { http, HttpResponse } from 'msw'
import type {
  HealthResponse,
  StatsResponse,
  JobListItem,
  JobDetailResponse,
  ApplicationListItem,
  ApplicationDetailResponse,
  LlmModel,
  ModelsResponse,
  SettingsResponse,
  SystemType,
  JobsearchContent,
  JobsearchVersion,
  LlmCallLogEntry,
  EvaluateResponse,
} from '@/types/api'

// ─── Fixture data ─────────────────────────────────────────────────────────────

export const MOCK_MODEL: LlmModel = {
  id: 1,
  model: 'llama3',
  endpoint: 'http://localhost:11434',
  available: 1,
  default_flag: 1,
  model_weight: 1,
  estimated_eval_time: 30,
  created_at: '2024-01-01T00:00:00',
}

export const MOCK_HEALTH: HealthResponse = {
  status: 'ok',
  database: { schema_version: '1.0' },
  models: [{ id: 1, model: 'llama3', endpoint: 'http://localhost:11434', available: true, default_flag: true }],
  anthropic_configured: false,
  version: '1.0.0',
}

export const MOCK_STATS: StatsResponse = {
  jobs: 5,
  evaluations: 3,
  applications: 2,
  llm_calls: 10,
}

export const MOCK_JOB: JobListItem = {
  id: 1,
  company_name: 'Acme Corp',
  title: 'Senior Engineer',
  location: 'Remote',
  remote_type: 'Remote',
  description_merged: 'A great job.',
  pay_band: '$120k-$150k',
  role_keyword: 'engineering',
  dedup_status: 'clean',
  first_seen_date: '2024-01-01',
  last_seen_date: '2024-01-01',
  posting_count: 1,
  is_repost: 0,
  agg_role_fit: 4.2,
  agg_scope_fit: 3.8,
  agg_culture: 4.0,
  agg_comp: 3.5,
  agg_score_overall: 7.8,
  my_role_fit: null,
  my_scope_fit: null,
  my_culture: null,
  my_comp: null,
  my_score_overall: null,
  excitement_level: null,
  created_at: '2024-01-01T00:00:00',
  project_id: null,
  application_id: 1,
  application_status: 'draft',
}

export const MOCK_JOB_DETAIL: JobDetailResponse = {
  job: {
    id: 1,
    company_name: 'Acme Corp',
    title: 'Senior Engineer',
    location: 'Remote',
    remote_type: 'Remote',
    description_merged: 'A great job.',
    pay_band: '$120k-$150k',
    role_keyword: 'engineering',
    dedup_status: 'clean',
    first_seen_date: '2024-01-01',
    last_seen_date: '2024-01-01',
    posting_count: 1,
    is_repost: 0,
    agg_role_fit: 4.2,
    agg_scope_fit: 3.8,
    agg_culture: 4.0,
    agg_comp: 3.5,
    agg_score_overall: 7.8,
    my_role_fit: null,
    my_scope_fit: null,
    my_culture: null,
    my_comp: null,
    my_score_overall: null,
    excitement_level: null,
    created_at: '2024-01-01T00:00:00',
    project_id: null,
  },
  evaluations: [],
  postings: [],
}

export const MOCK_APPLICATION: ApplicationListItem = {
  id: 1,
  job_id: 1,
  apply_date: '2024-01-15',
  end_date: null,
  requested_salary: null,
  application_status: 'applied',
  project_id: null,
  company_name: 'Acme Corp',
  title: 'Senior Engineer',
  location: 'Remote',
  remote_type: 'Remote',
  agg_score_overall: 7.8,
  excitement_level: null,
}

export const MOCK_APPLICATION_DETAIL: ApplicationDetailResponse = {
  application: {
    id: 1,
    job_id: 1,
    apply_date: '2024-01-15',
    end_date: null,
    requested_salary: null,
    application_status: 'applied',
    project_id: null,
  },
  job: MOCK_JOB_DETAIL.job,
  logs: [],
  audit: [],
  evaluations: [],
  postings: [],
}

export const MOCK_SETTINGS: SettingsResponse = {
  schema_version: '1.0',
  anthropic_api_key_configured: false,
  server: { host: '127.0.0.1', port: 8080 },
  logging: {},
  database: {},
}

export const MOCK_SYSTEM_TYPES: SystemType[] = [
  { id: 1, type_name: 'application_log', type_value: 'general', label: null, sort_order: null },
  { id: 2, type_name: 'application_log', type_value: 'recruiter_call', label: null, sort_order: null },
]

export const MOCK_JOBSEARCH: JobsearchContent = { content: '# My Job Search\n\nContext here.' }

export const MOCK_JOBSEARCH_VERSIONS: JobsearchVersion[] = [
  { id: 1, saved_at: '2024-01-01T00:00:00', note: 'Initial save' },
]

export const MOCK_LLM_LOG: LlmCallLogEntry[] = [
  {
    id: 1,
    timestamp: '2024-01-01T00:00:00',
    llm_model_id: 1,
    call_type: 'evaluation',
    prompt: 'Evaluate this job.',
    prompt_hash: 'abc123',
    raw_response: '{"score_overall": 8}',
    prompt_tokens_estimated: 100,
    prompt_tokens_actual: 95,
    completion_tokens_actual: 50,
    total_tokens_actual: 145,
    latency_ms: 1200,
    call_time: 2,
    success: 1,
    error_message: null,
    job_id: 1,
    search_run_id: null,
  },
]

export const MOCK_EVALUATE_RESPONSE: EvaluateResponse = {
  success: true,
  evaluation_id: 1,
  job_id: 1,
  report_path: null,
  evaluation: { score_overall: 8 },
  error: null,
  duplicate_detected: false,
  existing_jobs: null,
}

// ─── Handlers ─────────────────────────────────────────────────────────────────

export const handlers = [
  http.get('/api/v1/health', () => HttpResponse.json(MOCK_HEALTH)),
  http.get('/api/v1/stats', () => HttpResponse.json(MOCK_STATS)),
  http.get('/api/v1/jobs', () => HttpResponse.json([MOCK_JOB])),
  http.get('/api/v1/jobs/:id', () => HttpResponse.json(MOCK_JOB_DETAIL)),
  http.patch('/api/v1/jobs/:id', () => new HttpResponse(null, { status: 200 })),
  http.get('/api/v1/models', () => HttpResponse.json({ models: [MOCK_MODEL] } as ModelsResponse)),
  http.post('/api/v1/models', () => new HttpResponse(null, { status: 201 })),
  http.patch('/api/v1/models/:id', () => new HttpResponse(null, { status: 200 })),
  http.delete('/api/v1/models/:id', () => new HttpResponse(null, { status: 200 })),
  http.post('/api/v1/models/:id/set-default', () => new HttpResponse(null, { status: 200 })),
  http.post('/api/v1/applications', () => new HttpResponse(null, { status: 201 })),
  http.get('/api/v1/applications', () => HttpResponse.json([MOCK_APPLICATION])),
  http.get('/api/v1/applications/:id', () => HttpResponse.json(MOCK_APPLICATION_DETAIL)),
  http.patch('/api/v1/applications/:id', () => new HttpResponse(null, { status: 200 })),
  http.post('/api/v1/applications/:id/logs', () => new HttpResponse(null, { status: 201 })),
  http.delete('/api/v1/applications/:id/logs/:logId', () => new HttpResponse(null, { status: 200 })),
  http.post('/api/v1/applications/:id/generate-prompt', () =>
    HttpResponse.json({ prompt: 'Generated prompt text', log_id: 1 }),
  ),
  http.get('/api/v1/settings', () => HttpResponse.json(MOCK_SETTINGS)),
  http.patch('/api/v1/settings', () => new HttpResponse(null, { status: 200 })),
  http.get('/api/v1/system-types', () => HttpResponse.json(MOCK_SYSTEM_TYPES)),
  http.post('/api/v1/system-types', () => new HttpResponse(null, { status: 201 })),
  http.delete('/api/v1/system-types/:id', () => new HttpResponse(null, { status: 200 })),
  http.get('/api/v1/settings/jobsearch', () => HttpResponse.json(MOCK_JOBSEARCH)),
  http.put('/api/v1/settings/jobsearch', () => new HttpResponse(null, { status: 200 })),
  http.get('/api/v1/settings/jobsearch/versions', () => HttpResponse.json(MOCK_JOBSEARCH_VERSIONS)),
  http.get('/api/v1/settings/jobsearch/versions/:id', () => HttpResponse.json(MOCK_JOBSEARCH)),
  http.get('/api/v1/llm-call-log', () => HttpResponse.json(MOCK_LLM_LOG)),
  http.post('/api/v1/evaluate', () => HttpResponse.json(MOCK_EVALUATE_RESPONSE)),
  http.post('/api/v1/evaluations/import', () => HttpResponse.json({ success: true, evaluation_id: 1 })),
]
