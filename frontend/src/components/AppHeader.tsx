import { Link, useLocation } from 'react-router-dom'

interface AppHeaderProps {
  pageName?: string
}

function NavLinks(): React.JSX.Element {
  const { pathname } = useLocation()

  function linkClass(path: string): string {
    const active = pathname === path || (path !== '/' && pathname.startsWith(path))
    return `text-xs font-mono transition-colors ${active ? 'text-accent' : 'text-muted hover:text-text'}`
  }

  return (
    <nav className="ml-auto flex items-baseline gap-5">
      <Link to="/career" className={linkClass('/career')}>Career</Link>
      <Link to="/jobs" className={linkClass('/jobs')}>Job Search</Link>
      <Link to="/settings" className={linkClass('/settings')}>Settings</Link>
    </nav>
  )
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
        <NavLinks />
      </header>
    )
  }

  return (
    <header className="border-b border-surface2 px-12 py-4 flex items-baseline gap-4">
      <span className="font-serif text-accent text-2xl tracking-tight">AIstivus</span>
      <span className="font-mono text-xs text-muted uppercase tracking-widest">
        AI Job Search Helper for the Rest of Us
      </span>
      <NavLinks />
    </header>
  )
}
