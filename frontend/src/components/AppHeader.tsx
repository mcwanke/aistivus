import { Link } from 'react-router-dom'

interface AppHeaderProps {
  pageName?: string
}

export default function AppHeader({ pageName }: AppHeaderProps): React.JSX.Element {
  if (pageName) {
    return (
      <header className="sticky top-0 z-10 bg-bg border-b border-surface2 px-8 py-[18px] flex items-baseline gap-4">
        <Link
          to="/"
          className="text-xs font-mono text-muted/60 hover:text-muted transition-colors"
        >
          ← Home
        </Link>
        <Link
          to="/"
          className="font-serif text-accent text-2xl tracking-tight"
        >
          AIstivus
        </Link>
        <span className="text-sm text-text">{pageName}</span>
        <Link
          to="/settings"
          className="ml-auto text-xs font-mono text-muted hover:text-accent transition-colors"
        >
          Settings
        </Link>
      </header>
    )
  }

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
