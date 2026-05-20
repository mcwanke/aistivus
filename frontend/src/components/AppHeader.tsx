import { Link } from 'react-router-dom'

export default function AppHeader(): React.JSX.Element {
  return (
    <header className="border-b border-surface2 px-12 py-4 flex items-baseline gap-4">
      <span className="font-serif text-accent text-2xl tracking-tight">AIstivus</span>
      <span className="font-mono text-xs text-muted uppercase tracking-widest">
        AI Job Search Helper for the Rest of Us
      </span>
      <Link
        to="/settings"
        className="ml-auto font-mono text-xs text-muted hover:text-text transition-colors"
      >
        Settings
      </Link>
    </header>
  )
}
