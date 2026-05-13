import { NavLink, Outlet } from 'react-router-dom'

const NAV_ITEMS = [
  { to: '/',    label: 'Dashboard' },
  { to: '/jobs', label: 'Jobs' },
]

export default function Layout(): React.JSX.Element {
  return (
    <div className="flex h-screen overflow-hidden">
      {/* Sidebar */}
      <nav className="w-40 shrink-0 border-r border-surface2 flex flex-col py-4 px-3 gap-1">
        <p className="font-serif text-accent text-lg mb-4 px-2">AIstivus</p>
        {NAV_ITEMS.map(({ to, label }) => (
          <NavLink
            key={to}
            to={to}
            end
            className={({ isActive }) =>
              `px-2 py-1.5 rounded text-sm transition-colors ${
                isActive
                  ? 'bg-surface2 text-accent'
                  : 'text-muted hover:text-text hover:bg-surface'
              }`
            }
          >
            {label}
          </NavLink>
        ))}
      </nav>

      {/* Page content — overflow-hidden lets child pages manage their own scroll */}
      <div className="flex-1 overflow-hidden">
        <Outlet />
      </div>
    </div>
  )
}
