import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import type {
  PromptListItem,
  PromptRecord,
  PromptSavePayload,
  PromptPreviewResult,
  FeedbackLoopResult,
} from '@/types/api'

// ─── List ──────────────────────────────────────────────────────────────────────

async function fetchPrompts(): Promise<PromptListItem[]> {
  const res = await fetch('/api/v1/prompts')
  if (!res.ok) throw new Error(`prompts ${res.status}`)
  return res.json() as Promise<PromptListItem[]>
}

export function usePrompts() {
  return useQuery({ queryKey: ['prompts'], queryFn: fetchPrompts })
}

// ─── Single ────────────────────────────────────────────────────────────────────

async function fetchPrompt(key: string): Promise<PromptRecord> {
  const res = await fetch(`/api/v1/prompts/${key}`)
  if (!res.ok) throw new Error(`prompt ${key} ${res.status}`)
  return res.json() as Promise<PromptRecord>
}

export function usePrompt(key: string) {
  return useQuery({
    queryKey: ['prompt', key],
    queryFn: () => fetchPrompt(key),
    enabled: key !== '',
  })
}

// ─── Save ──────────────────────────────────────────────────────────────────────

export function useSavePrompt(key: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (payload: PromptSavePayload) => {
      const res = await fetch(`/api/v1/prompts/${key}/save`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { detail?: string }
        throw new Error(err.detail ?? `save prompt ${res.status}`)
      }
      return res.json() as Promise<{ success: boolean; version: number }>
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['prompts'] })
      void qc.invalidateQueries({ queryKey: ['prompt', key] })
      void qc.invalidateQueries({ queryKey: ['prompt-preview', key] })
    },
  })
}

// ─── Preview ───────────────────────────────────────────────────────────────────

async function fetchPromptPreview(key: string): Promise<PromptPreviewResult> {
  const res = await fetch(`/api/v1/prompts/${key}/preview`)
  if (!res.ok) throw new Error(`prompt preview ${key} ${res.status}`)
  return res.json() as Promise<PromptPreviewResult>
}

export function usePromptPreview(key: string) {
  return useQuery({
    queryKey: ['prompt-preview', key],
    queryFn: () => fetchPromptPreview(key),
    enabled: key !== '',
  })
}

// ─── Feedback Loop ─────────────────────────────────────────────────────────────

export function useFeedbackLoop(key: string) {
  return useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/v1/prompts/${key}/feedback-loop`, {
        method: 'POST',
      })
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { detail?: string }
        throw new Error(err.detail ?? `feedback loop ${res.status}`)
      }
      return res.json() as Promise<FeedbackLoopResult>
    },
  })
}
