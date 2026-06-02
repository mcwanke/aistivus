// ─── LLM Server types ─────────────────────────────────────────────────────────

export type ServerType = 'local' | 'anthropic'

export interface LlmServer {
  id: number
  server_name: string
  endpoint: string | null
  server_type: ServerType
  created_at: string
  model_count: number
  anthropic_key_present?: boolean  // only present when server_type === 'anthropic'
}

export interface ConnectionTestResult {
  success: boolean
  error?: string
  model_count?: number  // only present on successful local Ollama test
}

export interface AvailableModelsResponse {
  models: string[]
}

export interface AnthropicKeyStatus {
  anthropic_key_present: boolean
}

// ─── Shared primitives ───────────────────────────────────────────────────────

export type ApplicationStatus =
  | 'not-started'
  | 'draft'
  | 'applied'
  | 'screening'
  | 'interview'
  | 'offer'
  | 'rejected'
  | 'ghosted'
  | 'withdrawn'

export type FitType = 'Core Fit' | 'Stretch' | 'Mismatch'

export type Recommendation = 'Apply' | 'Apply with modifications' | 'Skip'

// ─── GET /api/v1/health ───────────────────────────────────────────────────────

export interface LlmModelHealth {
  id: number
  model: string
  server_name: string
  server_type: ServerType
  available: boolean
  default_flag: boolean
}

export interface HealthResponse {
  status: 'ok' | 'degraded'
  database: { schema_version: string }
  models: LlmModelHealth[]
  anthropic_configured: boolean
  typst_available: boolean
  version: string
}

// ─── GET /api/v1/stats ────────────────────────────────────────────────────────

export interface StatsResponse {
  jobs: number
  evaluations: number
  applications: number
  llm_calls: number
  jobs_applied_to: number
  applications_in_process: number
}

// ─── GET /api/v1/models ───────────────────────────────────────────────────────

export interface LlmModel {
  id: number
  model: string
  server_id: number
  server_name: string     // from JOIN on llm_servers
  server_type: ServerType // from JOIN on llm_servers
  endpoint: string | null // from JOIN (null for anthropic)
  available: number       // 0 | 1 from SQLite
  default_flag: number    // 0 | 1 from SQLite
  model_weight: number
  estimated_eval_time: number | null
  created_at: string
}

export interface ModelsResponse {
  models: LlmModel[]
}

// ─── Evaluation (shared shape) ────────────────────────────────────────────────

export interface Evaluation {
  id: number
  job_id: number
  llm_model_id: number
  score_overall: number | null
  score_role_fit: number | null
  score_scope_fit: number | null
  score_culture: number | null
  score_comp: number | null
  fit_type: FitType | null
  archetype: string | null
  strengths: string | null
  gaps: string | null
  recommendation: Recommendation | null
  keywords: string | null
  domain_match: string | null
  role_type_match: string | null
  keyword_gaps: string | null
  llm_call_log_id: number | null
  evaluated_at: string
}

// ─── GET /api/v1/evaluations ─────────────────────────────────────────────────
// Each row joins in job + model info

export interface EvaluationListItem extends Evaluation {
  title: string
  company_name: string
  location: string | null
  remote_type: string | null
  model_name: string
}

// GET /api/v1/evaluations returns EvaluationListItem[]

// ─── GET /api/v1/evaluations/{id} ────────────────────────────────────────────

export interface EvaluationDetail extends EvaluationListItem {
  pay_band: string | null
  report_path: string | null
}

// ─── Job (shared shape) ───────────────────────────────────────────────────────

export interface Job {
  id: number
  company_name: string
  title: string
  location: string | null
  remote_type: string | null
  description_merged: string | null
  pay_band: string | null
  role_keyword: string | null
  dedup_status: string
  first_seen_date: string | null
  last_seen_date: string | null
  posting_count: number
  is_repost: number
  agg_role_fit: number | null
  agg_scope_fit: number | null
  agg_culture: number | null
  agg_comp: number | null
  agg_score_overall: number | null
  my_role_fit: number | null
  my_scope_fit: number | null
  my_culture: number | null
  my_comp: number | null
  my_score_overall: number | null
  excitement_level: string | null
  created_at: string
  project_id: number | null
  is_active: number
  application_id: number | null  // returned by job detail endpoint via JOIN (Phase 1.5)
}

// ─── GET /api/v1/jobs ─────────────────────────────────────────────────────────
// Joins in current application status

export interface JobListItem extends Job {
  application_id: number | null
  application_status: ApplicationStatus | null
  eval_count: number
}

// GET /api/v1/jobs returns JobListItem[]

// ─── GET /api/v1/jobs/{id} ────────────────────────────────────────────────────

export interface JobPosting {
  id: number
  job_id: number
  source_board: string | null
  source_url: string | null
  description_raw: string | null
  date_posted: string | null
  date_scraped: string
  is_repost: number
  days_since_prior_posting: number | null
  repost_url_changed: number
}

export interface CompanyLogEntry {
  id: number
  job_id: number
  type_id: number
  type_name: string
  type_value: string
  log: string | null
  url: string | null
  log_timestamp: string
}

export interface JobDetailResponse {
  job: Job
  evaluations: Array<Evaluation & { report_path: string | null; model_name: string; prompt: string | null }>
  postings: JobPosting[]
  company_log: CompanyLogEntry[]
}

// ─── GET /api/v1/jobs/{id}/application ───────────────────────────────────────

export interface JobApplicationResponse {
  exists: boolean
  application: Application | null
}

// ─── Application (shared shape) ───────────────────────────────────────────────

export interface Application {
  id: number
  job_id: number
  apply_date: string | null
  end_date: string | null
  requested_salary: string | null
  application_status: ApplicationStatus
  applied: number
  project_id: number | null
}

// ─── GET /api/v1/applications ────────────────────────────────────────────────
// Joins in job info

export interface ApplicationListItem extends Application {
  company_name: string
  title: string
  location: string | null
  remote_type: string | null
  agg_score_overall: number | null
  excitement_level: string | null
}

// GET /api/v1/applications returns ApplicationListItem[]

// ─── GET /api/v1/applications/{id} ───────────────────────────────────────────

export interface ApplicationLog {
  id: number
  application_id: number
  type_id: number
  type_value: string
  log: string | null
  url: string | null
  log_timestamp: string
  llm_call_log_id: number | null
}

export interface ApplicationAuditEntry {
  id: number
  application_id: number
  job_id: number | null  // nullable; set for job-scope events (Phase 1.5)
  timestamp: string
  event: string
}

export interface ApplicationDetailResponse {
  application: Application
  job: Job | null
  logs: ApplicationLog[]
  audit: ApplicationAuditEntry[]
  evaluations: Evaluation[]
  postings: JobPosting[]
}

// ─── GET /api/v1/llm-call-log ────────────────────────────────────────────────

export interface LlmCallLogEntry {
  id: number
  timestamp: string
  llm_model_id: number | null
  call_type: string | null
  prompt: string | null
  prompt_hash: string | null
  raw_response: string | null
  prompt_tokens_estimated: number | null
  prompt_tokens_actual: number | null
  completion_tokens_actual: number | null
  total_tokens_actual: number | null
  latency_ms: number | null
  call_time: number | null
  success: number
  error_message: string | null
  job_id: number | null
  search_run_id: number | null
  model_name: string | null
  job_company_name: string | null
  job_title: string | null
}

// GET /api/v1/llm-call-log returns LlmCallLogEntry[]

// ─── GET /api/v1/system-types ────────────────────────────────────────────────

export interface SystemType {
  id: number
  type_name: string
  type_value: string
  label: string | null
  sort_order: number | null
}

// GET /api/v1/system-types returns SystemType[]

// ─── GET /api/v1/settings/app ────────────────────────────────────────────────

export interface AppSetting {
  id: number
  key: string
  value: string
  created_at: string
}

// GET /api/v1/settings/app returns AppSetting[]

// ─── GET /api/v1/settings ────────────────────────────────────────────────────

export interface SettingsResponse {
  app_version: string
  schema_version: string
  anthropic_api_key_configured: boolean
  server: Record<string, unknown>
  logging: Record<string, unknown>
  database: Record<string, unknown>
}

// ─── GET /api/v1/settings/jobsearch ──────────────────────────────────────────

export interface JobsearchContent {
  content: string
  has_backup: boolean
}

export interface JobsearchVersion {
  id: number
  saved_at: string
  note: string | null
}

// ─── GET /api/v1/settings/resume-template ────────────────────────────────────

export interface ResumeTemplateContent {
  content: string
  has_backup: boolean
}

// ─── GET /api/v1/inbox/files ─────────────────────────────────────────────────

export interface InboxFilesResponse {
  pending: string[]
}

// ─── Duplicate detection ──────────────────────────────────────────────────────

export interface ExistingJob {
  id: number
  company_name: string
  title: string
  first_seen_date: string | null
  eval_count: number
  latest_score: number | null
}

// ─── POST /api/v1/evaluate ───────────────────────────────────────────────────

export interface EvaluateResponse {
  success: boolean
  evaluation_id: number | null
  job_id: number | null
  report_path: string | null
  evaluation: Record<string, unknown> | null
  error: string | null
  duplicate_detected: boolean
  existing_jobs: ExistingJob[] | null
}

// ─── GET /api/v1/applications/{id}/questions ─────────────────────────────────

export interface ApplicationQuestion {
  id: number
  application_id: number
  question: string
  response: string | null
  created_at: string
}

// ─── GET /api/v1/jobs/{id}/activity-log ──────────────────────────────────────

export type ActivityEntryType =
  | 'evaluation'
  | 'llm_call'
  | 'application_log'
  | 'audit'
  | 'company_log'
  | 'job_posting'
  | 'application_question'

export interface ActivityLogEntry {
  entry_type: ActivityEntryType
  timestamp: string
  activity_type: string
  source: string
  text: string | null
  url: string | null
  raw_id: number | null
  can_delete: boolean
  can_edit_timestamp: boolean
}

export interface ActivityLogResponse {
  entries: ActivityLogEntry[]
}

