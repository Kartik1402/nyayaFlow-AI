import { NavLink } from 'react-router-dom'

interface SidebarProps {
  onAddCase?: () => void
}

const menuItems = [
  { label: 'Dashboard', to: '/verified' },
  { label: 'Cases', to: '/cases' },
]

export default function Sidebar({}: SidebarProps) {
  return (
    <aside className="hidden w-72 shrink-0 bg-sky-950 px-6 py-8 lg:block">
      <div className="mb-10 text-sm font-bold uppercase tracking-[0.32em] text-sky-100">
        NyayaFlow AI
      </div>
      <nav className="space-y-2">
        {menuItems.map((item) => (
          <NavLink
            key={item.label}
            to={item.to}
            className={({ isActive }) =>
              `flex w-full items-center justify-between rounded-3xl px-4 py-4 text-left text-sm font-semibold transition ${
                isActive
                  ? 'bg-slate-100 text-slate-950 shadow-sm'
                  : 'text-slate-200 hover:bg-sky-900/90 hover:text-white'
              }`
            }
          >
            <span>{item.label}</span>
          </NavLink>
        ))}
      </nav>
    </aside>
  )
}
