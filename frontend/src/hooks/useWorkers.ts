import { useQuery } from '@tanstack/react-query'

export interface Worker {
  id: number
  worker_type: string
  status: 'pending' | 'running' | 'completed' | 'failed'
  entity_type: string
  entity_id: number
  result_url: string
  input_json: Record<string, unknown> | null
  output_json: Record<string, unknown> | null
  error: string | null
  is_viewed: number
  created_at: string
  started_at: string | null
  completed_at: string | null
}

export function useAllWorkers() {
  return useQuery({
    queryKey: ['workers'],
    queryFn: async () => {
      const response = await fetch('/api/v1/workers')
      if (!response.ok) {
        throw new Error('Failed to fetch workers')
      }
      return response.json() as Promise<Worker[]>
    },
    refetchInterval: 10000, // Auto-refresh every 10 seconds
  })
}

export function useWorkersByFilter(
  filter: 'all' | 'today' | 'running' | 'errors' | 'completed' | 'unviewed'
) {
  const { data, ...query } = useAllWorkers()

  const filtered = data ? filterWorkers(data, filter) : []

  return { data: filtered, ...query }
}

function filterWorkers(workers: Worker[], filter: string): Worker[] {
  const now = new Date()
  const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000)

  let result = workers

  if (filter === 'today') {
    result = result.filter(w => new Date(w.created_at) >= oneDayAgo)
  } else if (filter === 'running') {
    result = result.filter(w => w.status === 'running')
  } else if (filter === 'errors') {
    result = result.filter(w => w.status === 'failed')
  } else if (filter === 'completed') {
    result = result.filter(w => w.status === 'completed')
  } else if (filter === 'unviewed') {
    result = result.filter(w => w.is_viewed === 0)
  }

  // Sort by created_at descending
  return result.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
}
