import type { LlmModel } from '@/types/api'

interface ModelSelectProps {
  models: LlmModel[]
  value: number | null
  onChange: (id: number | null) => void
  disabled?: boolean
}

export default function ModelSelect({ models, value, onChange, disabled }: ModelSelectProps): React.JSX.Element {
  const sorted = [...models].sort((a, b) => {
    const s = a.server_name.localeCompare(b.server_name)
    return s !== 0 ? s : a.model.localeCompare(b.model)
  })

  const grouped = sorted.reduce<Map<string, LlmModel[]>>((acc, m) => {
    const g = acc.get(m.server_name) ?? []
    g.push(m)
    acc.set(m.server_name, g)
    return acc
  }, new Map())

  return (
    <select
      value={value ?? ''}
      onChange={e => onChange(e.target.value ? parseInt(e.target.value, 10) : null)}
      disabled={disabled}
      className="bg-surface border border-surface2 rounded px-3 py-2 text-sm font-mono text-text focus:outline-none focus:border-accent/50 disabled:opacity-50"
    >
      {Array.from(grouped.entries()).map(([serverName, serverModels]) => (
        <optgroup key={serverName} label={serverName}>
          {serverModels.map(m => (
            <option key={m.id} value={m.id} disabled={m.available !== 1}>
              {m.model}
              {m.default_flag === 1 ? ' (default)' : ''}
              {m.available !== 1 ? ' (unavailable)' : ''}
            </option>
          ))}
        </optgroup>
      ))}
    </select>
  )
}
