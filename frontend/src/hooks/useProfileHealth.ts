import { useQuery } from '@tanstack/react-query'
import type { ProfileHealth } from '@/types/profile'

async function fetchProfileHealth(): Promise<ProfileHealth> {
  const res = await fetch('/api/v1/profile/health')
  if (!res.ok) throw new Error(`profile health ${res.status}`)
  return res.json() as Promise<ProfileHealth>
}

export function useProfileHealth() {
  return useQuery({
    queryKey: ['profile-health'],
    queryFn: fetchProfileHealth,
    staleTime: 60_000,
  })
}
