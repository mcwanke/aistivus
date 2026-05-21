import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import type { ApplicationQuestion } from '@/types/api'

// ─── Fetchers ─────────────────────────────────────────────────────────────────

async function fetchApplicationQuestions(applicationId: number): Promise<ApplicationQuestion[]> {
  const res = await fetch(`/api/v1/applications/${applicationId}/questions`)
  if (!res.ok) throw new Error(`questions ${res.status}`)
  return res.json() as Promise<ApplicationQuestion[]>
}

// ─── Hooks ────────────────────────────────────────────────────────────────────

export function useApplicationQuestions(applicationId: number | null) {
  return useQuery({
    queryKey: ['application-questions', applicationId],
    queryFn: () => fetchApplicationQuestions(applicationId!),
    enabled: applicationId !== null,
  })
}

// ─── Mutations ────────────────────────────────────────────────────────────────

interface CreateQuestionPayload {
  applicationId: number
  jobId: number
  question: string
  response?: string
}

export function useCreateApplicationQuestion() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ applicationId, question, response }: CreateQuestionPayload) => {
      const res = await fetch(`/api/v1/applications/${applicationId}/questions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question, response: response ?? null }),
      })
      if (!res.ok) throw new Error(`create question ${res.status}`)
      return res.json() as Promise<ApplicationQuestion>
    },
    onSuccess: (_data, { applicationId, jobId }) => {
      void qc.invalidateQueries({ queryKey: ['application-questions', applicationId] })
      void qc.invalidateQueries({ queryKey: ['activity-log', jobId] })
    },
  })
}

interface UpdateQuestionPayload {
  applicationId: number
  questionId: number
  question?: string
  response?: string | null
}

export function useUpdateApplicationQuestion() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ applicationId, questionId, question, response }: UpdateQuestionPayload) => {
      const res = await fetch(
        `/api/v1/applications/${applicationId}/questions/${questionId}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ question, response }),
        }
      )
      if (!res.ok) throw new Error(`update question ${res.status}`)
      return res.json() as Promise<ApplicationQuestion>
    },
    onSuccess: (_data, { applicationId }) => {
      void qc.invalidateQueries({ queryKey: ['application-questions', applicationId] })
    },
  })
}

interface DeleteQuestionPayload {
  applicationId: number
  questionId: number
}

export function useDeleteApplicationQuestion() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ applicationId, questionId }: DeleteQuestionPayload) => {
      const res = await fetch(
        `/api/v1/applications/${applicationId}/questions/${questionId}`,
        { method: 'DELETE' }
      )
      if (!res.ok) throw new Error(`delete question ${res.status}`)
      return res.json() as Promise<{ deleted: boolean }>
    },
    onSuccess: (_data, { applicationId }) => {
      void qc.invalidateQueries({ queryKey: ['application-questions', applicationId] })
    },
  })
}
