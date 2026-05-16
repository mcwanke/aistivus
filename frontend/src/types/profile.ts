export interface SectionHealth {
  id: string
  name: string
  complete: boolean
}

export interface ProfileHealth {
  total_sections: number
  completed_sections: number
  completion_pct: number
  sections: SectionHealth[]
  file_exists: boolean
  token_estimate: number
}

export interface ProfileSection {
  id: string
  name: string
  content: string
  complete: boolean
  recommended_mode: 'socratic' | 'directive' | 'generate' | 'edit_only' | 'either' | 'synthesize'
}

export interface ProfileSections {
  sections: ProfileSection[]
}

export type ChatMode = 'socratic' | 'directive'

export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

export interface ChatRequest {
  section_id: string
  mode: ChatMode
  messages: ChatMessage[]
  section_content: string
  experience_level?: string
}

export interface ProposedUpdate {
  proposed_content: string
  section_id: string
}

export interface ProfileVersion {
  id: number
  saved_at: string
  note: string
}

export interface SynthesizeInsightsResponse {
  proposed_content: string
  section_id: string
}

export interface CoherenceCheckResponse {
  review: string
  issues_found: number
}

export interface LessonChatFinalizeResponse {
  log_entry: string
  insights_addition: string
  application_id: number
}
