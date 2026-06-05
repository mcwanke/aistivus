import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import type {
  ApplicationDocument,
  DocumentUploadResult,
  CompileResult,
  FinalizeResult,
  TypstTemplateList,
  DocumentsStorageInfo,
  RenameDocumentRequest,
} from '@/types/documents'

// ─── Queries ──────────────────────────────────────────────────────────────────

export function useApplicationDocuments(applicationId: number) {
  return useQuery({
    queryKey: ['documents', applicationId],
    queryFn: async () => {
      const res = await fetch(`/api/v1/applications/${applicationId}/documents`)
      if (!res.ok) throw new Error(`documents ${res.status}`)
      return res.json() as Promise<ApplicationDocument[]>
    },
    staleTime: 0,
  })
}

export function useDocumentContent(applicationId: number, docId: number | null) {
  return useQuery({
    queryKey: ['document-content', applicationId, docId],
    queryFn: async () => {
      const res = await fetch(
        `/api/v1/applications/${applicationId}/documents/${docId}/content`
      )
      if (!res.ok) throw new Error(`document content ${res.status}`)
      return res.json() as Promise<{ content: string; filename: string }>
    },
    enabled: docId !== null,
  })
}

export function useTypstTemplates() {
  return useQuery({
    queryKey: ['typst-templates'],
    queryFn: async () => {
      const res = await fetch('/api/v1/templates/typst')
      if (!res.ok) throw new Error(`typst templates ${res.status}`)
      return res.json() as Promise<TypstTemplateList>
    },
    staleTime: 60_000,
  })
}

export function useDocumentsStorage() {
  return useQuery({
    queryKey: ['documents-storage'],
    queryFn: async () => {
      const res = await fetch('/api/v1/settings/documents-storage')
      if (!res.ok) throw new Error(`documents storage ${res.status}`)
      return res.json() as Promise<DocumentsStorageInfo>
    },
    staleTime: 30_000,
  })
}

// ─── Mutations ────────────────────────────────────────────────────────────────

export function useUploadDocument(applicationId: number) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (payload: { file: File; doc_type: 'resume' | 'cover_letter' }) => {
      const form = new FormData()
      form.append('file', payload.file)
      form.append('doc_type', payload.doc_type)
      const res = await fetch(`/api/v1/applications/${applicationId}/documents`, {
        method: 'POST',
        body: form,
      })
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { detail?: string }
        throw new Error(err.detail ?? `upload ${res.status}`)
      }
      return res.json() as Promise<DocumentUploadResult>
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['documents', applicationId] }),
  })
}

export function useDeleteDocument(applicationId: number) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (docId: number) => {
      const res = await fetch(
        `/api/v1/applications/${applicationId}/documents/${docId}`,
        { method: 'DELETE' }
      )
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { detail?: string }
        throw new Error(err.detail ?? `delete ${res.status}`)
      }
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['documents', applicationId] }),
  })
}

export function useCompileDocument(applicationId: number) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (docId: number) => {
      const res = await fetch(
        `/api/v1/applications/${applicationId}/documents/${docId}/compile`,
        { method: 'POST' }
      )
      const data = (await res.json().catch(() => ({}))) as CompileResult
      if (!res.ok) return { ...data, success: false }
      return data
    },
    onSuccess: (data) => {
      if (data.success) {
        void qc.invalidateQueries({ queryKey: ['documents', applicationId] })
      }
    },
  })
}

export function useFinalizeDocument(applicationId: number) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (docId: number) => {
      const res = await fetch(
        `/api/v1/applications/${applicationId}/documents/${docId}/finalize`,
        { method: 'POST' }
      )
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { detail?: string }
        throw new Error(err.detail ?? `finalize ${res.status}`)
      }
      return res.json() as Promise<FinalizeResult>
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['documents', applicationId] }),
  })
}

export function useSaveDocumentContent(applicationId: number) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (payload: { docId: number; content: string }) => {
      const res = await fetch(
        `/api/v1/applications/${applicationId}/documents/${payload.docId}/content`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ content: payload.content }),
        }
      )
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { detail?: string }
        throw new Error(err.detail ?? `save content ${res.status}`)
      }
    },
    onSuccess: (_data, payload) =>
      void qc.invalidateQueries({
        queryKey: ['document-content', applicationId, payload.docId],
      }),
  })
}

export function useRenameDocument(applicationId: number) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (payload: { docId: number } & RenameDocumentRequest) => {
      const res = await fetch(
        `/api/v1/applications/${applicationId}/documents/${payload.docId}/rename`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ new_name: payload.new_name }),
        }
      )
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { detail?: string }
        throw Object.assign(new Error(err.detail ?? `rename ${res.status}`), { status: res.status })
      }
      return res.json() as Promise<DocumentUploadResult>
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['documents', applicationId] }),
  })
}

export function useCopyTemplate(applicationId: number) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (payload: {
      template_filename: string
      category: 'resume' | 'cover_letter'
    }) => {
      const res = await fetch(
        `/api/v1/applications/${applicationId}/documents/from-template`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        }
      )
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { detail?: string }
        throw new Error(err.detail ?? `copy template ${res.status}`)
      }
      return res.json() as Promise<DocumentUploadResult>
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['documents', applicationId] }),
  })
}
