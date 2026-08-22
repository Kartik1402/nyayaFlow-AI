import { NavLink } from 'react-router-dom'

interface SidebarProps {
  onAddCase?: () => void
}

const menuItems = [
  { label: 'Verified Cases', to: '/verified' },
  { label: 'Case Queue', to: '/cases' },
]

export default function Sidebar({}: SidebarProps) {
  return (
    <aside className="hidden w-72 shrink-0 border-r border-slateface bg-graphite px-6 py-8 lg:block">
      <div className="mb-12 flex items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-limeaccent/10 border border-limeaccent/30 text-limeaccent font-bold font-display text-lg shadow-lime">
          N
        </div>
        <div className="font-display text-lg font-bold tracking-wider text-white">
          NYAYAFLOW<span className="text-limeaccent font-light">.AI</span>
        </div>
      </div>
      
      <div className="mb-8">
        <p className="px-4 text-[10px] font-bold uppercase tracking-[0.25em] text-slate-500">Legal Intelligence</p>
      </div>

      <nav className="space-y-1.5">
        {menuItems.map((item) => (
          <NavLink
            key={item.label}
            to={item.to}
            className={({ isActive }) =>
              `flex w-full items-center justify-between rounded-xl px-4 py-3.5 text-left text-sm font-semibold transition-all duration-250 ${
                isActive
                  ? 'bg-limeaccent/10 text-limeaccent border-l-2 border-limeaccent font-medium shadow-lime'
                  : 'text-slate-400 hover:bg-slateface/40 hover:text-slate-200'
              }`
            }
          >
            <span>{item.label}</span>
            {item.to === '/cases' && (
              <span className="flex h-2 w-2 rounded-full bg-limeaccent animate-pulse" />
            )}
          </NavLink>
        ))}
      </nav>
    </aside>
  )
}
