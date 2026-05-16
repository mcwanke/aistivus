import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import type { ProfileSections } from '@/types/profile'

async function fetchProfileSections(): Promise<ProfileSections> {
  const res = await fetch('/api/v1/profile/sections')
  if (!res.ok) throw new Error(`profile sections ${res.status}`)
  return res.json() as Promise<ProfileSections>
}

export function useProfileSections() {
  return useQuery({
    queryKey: ['profile-sections'],
    queryFn: fetchProfileSections,
  })
}

interface UpdateSectionPayload {
  sectionId: string
  content: string
  note: string
}

interface UpdateSectionResponse {
  success: boolean
  version_id: number
}

export function useUpdateSection() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ sectionId, content, note }: UpdateSectionPayload) => {
      const res = await fetch(`/api/v1/profile/sections/${sectionId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content, note }),
      })
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { detail?: string }
        throw new Error(err.detail ?? `update section ${sectionId} ${res.status}`)
      }
      return res.json() as Promise<UpdateSectionResponse>
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['profile-sections'] })
      void qc.invalidateQueries({ queryKey: ['profile-health'] })
      void qc.invalidateQueries({ queryKey: ['profile-versions'] })
    },
  })
}
