import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import type { ProfileVersion } from '@/types/profile'

async function fetchProfileVersions(): Promise<ProfileVersion[]> {
  const res = await fetch('/api/v1/profile/versions')
  if (!res.ok) throw new Error(`profile versions ${res.status}`)
  return res.json() as Promise<ProfileVersion[]>
}

export function useProfileVersions() {
  return useQuery({
    queryKey: ['profile-versions'],
    queryFn: fetchProfileVersions,
  })
}

export function useProfileVersionContent(versionId: number | null) {
  return useQuery({
    queryKey: ['profile-version', versionId],
    queryFn: async () => {
      const res = await fetch(`/api/v1/profile/versions/${versionId}`)
      if (!res.ok) throw new Error(`profile version ${versionId} ${res.status}`)
      return res.json() as Promise<{ content: string }>
    },
    enabled: versionId !== null,
  })
}

export function useRestoreVersion() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (versionId: number) => {
      const res = await fetch(`/api/v1/profile/restore/${versionId}`, {
        method: 'POST',
      })
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { detail?: string }
        throw new Error(err.detail ?? `restore version ${versionId} ${res.status}`)
      }
      return res.json() as Promise<{ success: boolean }>
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['profile-sections'] })
      void qc.invalidateQueries({ queryKey: ['profile-health'] })
      void qc.invalidateQueries({ queryKey: ['profile-versions'] })
    },
  })
}
