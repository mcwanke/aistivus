import { useNavigate, Link } from 'react-router-dom'
import { useOrgs } from '@/hooks/useOrgs'
import type { Org } from '@/types/api'
import AppHeader from '@/components/AppHeader'

// ─── Org row ──────────────────────────────────────────────────────────────────

function OrgRow({ org, onSelect }: { org: Org; onSelect: () => void }): React.JSX.Element {
  return (
    <button
      onClick={onSelect}
      className="w-full text-left border-b border-surface2 hover:bg-surface2 transition-colors px-4 py-3"
    >
      <div className="text-sm font-serif text-text">{org.name}</div>
    </button>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function Orgs(): React.JSX.Element {
  const navigate = useNavigate()
  const { data: orgs, isLoading, isError } = useOrgs()

  return (
    <div className="flex flex-col h-screen">
      <AppHeader pageName="Organizations" />
      <div className="px-4 py-3 border-b border-surface2 shrink-0 flex items-baseline gap-3">
        <h1 className="font-serif text-accent text-xl">Organizations</h1>
        {orgs && (
          <span className="text-muted text-[0.65rem] font-mono">{orgs.length} organizations</span>
        )}
        <Link to="/createorg" className="ml-auto text-xs font-mono text-accent hover:text-text transition-colors">Create A New Org</Link>
      </div>
      <div className="flex-1 overflow-y-auto">
        {isLoading && <p className="text-muted text-sm p-4">Loading organizations…</p>}
        {isError && <p className="text-red text-sm p-4">Failed to load organizations.</p>}
        {!isLoading && !isError && orgs?.length === 0 && (
          <p className="text-muted text-sm p-4">No organizations yet.</p>
        )}
        {orgs && orgs.map((org) => (
          <OrgRow key={org.id} org={org} onSelect={() => navigate(`/orgs/${org.id}`)} />
        ))}
      </div>
    </div>
  )
}
