import type { ApplicationStatus } from '@/types/api'

export const STATUSES: ApplicationStatus[] = [
  'draft',
  'applied',
  'screening',
  'interview',
  'offer',
  'rejected',
  'ghosted',
  'withdrawn',
]

export const STATUS_COLORS: Record<ApplicationStatus, string> = {
  'not-started': 'bg-surface2 text-muted',
  draft:         'bg-surface2 text-muted',
  applied:       'bg-accent/15 text-accent',
  screening:     'bg-accent/25 text-accent',
  interview:     'bg-green/15 text-green',
  offer:         'bg-green/25 text-green',
  rejected:      'bg-red/15 text-red',
  ghosted:       'bg-red/10 text-red',
  withdrawn:     'bg-surface2 text-dim',
}

interface StatusBadgeProps {
  status: ApplicationStatus | null | undefined
}

export function StatusBadge({ status }: StatusBadgeProps): React.JSX.Element {
  if (!status) {
    return (
      <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-surface2 text-muted uppercase tracking-wider">
        —
      </span>
    )
  }
  return (
    <span
      className={`text-[10px] font-mono px-2 py-0.5 rounded uppercase tracking-wider ${STATUS_COLORS[status] ?? 'bg-surface2 text-muted'}`}
    >
      {status}
    </span>
  )
}
