import { motion } from 'framer-motion'
import {
  Activity,
  BarChart3,
  Briefcase,
  FileBarChart,
  LayoutDashboard,
  LogOut,
  Menu,
  Settings2,
  ShieldCheck,
  Users,
  X,
} from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { BRAND } from '../../lib/constants'
import { useAuth } from '../../state/AuthContext'

/**
 * Administrators only. The check is a live call to the server (`/api/admin/me`), which reads the role
 * from the database — the client never decides who is an administrator, and there is no email check
 * anywhere in this file.
 */

const NAV = [
  { to: '/admin', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/admin/users', label: 'Users', icon: Users },
  { to: '/admin/interviews', label: 'Interviews', icon: Briefcase },
  { to: '/admin/reports', label: 'Reports', icon: FileBarChart },
  { to: '/admin/analytics', label: 'Analytics', icon: BarChart3 },
  { to: '/admin/system', label: 'System', icon: Activity },
  { to: '/admin/settings', label: 'Settings', icon: Settings2 },
]

export function AdminLayout({ children }: { children?: ReactNode }) {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)

  useEffect(() => {
    setOpen(false)
  }, [navigate])

  const onSignOut = async () => {
    await logout()
    navigate('/login', { replace: true })
  }

  return (
    <div className="flex min-h-screen w-full bg-ink-950">
      {/* Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-40 w-72 shrink-0 border-r border-white/[0.06] bg-surface/95 backdrop-blur-xl transition-transform duration-200 lg:static lg:translate-x-0 ${
          open ? 'translate-x-0' : '-translate-x-full'
        }`}
        aria-label="Admin navigation"
      >
        <div className="flex h-16 items-center justify-between gap-3 border-b border-white/[0.06] px-5">
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-accent-sheen shadow-glow">
              <ShieldCheck className="h-4 w-4 text-white" aria-hidden />
            </span>
            <span>
              <span className="block text-sm font-semibold text-ink-50">{BRAND.product} Admin</span>
              <span className="block text-2xs text-ink-500">{BRAND.studioLine}</span>
            </span>
          </div>
          <button type="button" className="rounded-xl p-2 text-ink-400 hover:text-ink-100 lg:hidden" onClick={() => setOpen(false)} aria-label="Close navigation">
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>

        <nav className="space-y-1 p-3">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-2xl px-3 py-2.5 text-sm font-medium transition-colors ${
                  isActive ? 'bg-accent/15 text-ink-50 ring-1 ring-inset ring-accent/30' : 'text-ink-300 hover:bg-white/[0.05] hover:text-ink-100'
                }`
              }
            >
              <item.icon className="h-4 w-4" aria-hidden />
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="absolute inset-x-0 bottom-0 border-t border-white/[0.06] p-3">
          <button type="button" onClick={onSignOut} className="btn-ghost w-full justify-start text-ink-300">
            <LogOut className="h-4 w-4" aria-hidden />
            Sign out
          </button>
        </div>
      </aside>

      {open ? <button className="fixed inset-0 z-30 bg-black/60 lg:hidden" aria-label="Close navigation overlay" onClick={() => setOpen(false)} /> : null}

      {/* Content */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex h-16 items-center justify-between gap-4 border-b border-white/[0.06] bg-ink-950/85 px-4 backdrop-blur-xl sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <button
              type="button"
              className="rounded-xl border border-white/10 p-2 text-ink-300 hover:text-ink-100 lg:hidden"
              onClick={() => setOpen(true)}
              aria-label="Open navigation"
            >
              <Menu className="h-4 w-4" aria-hidden />
            </button>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-ink-50">VozHireQ Admin</p>
              <p className="truncate text-2xs text-ink-500">{BRAND.productDescription}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="hidden text-2xs text-ink-400 sm:block">{user?.email}</span>
            <span className="chip border-accent/40 bg-accent/10 text-accent-soft">
              <ShieldCheck className="h-3 w-3" aria-hidden />
              Administrator
            </span>
          </div>
        </header>

        <motion.main
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25 }}
          className="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-8"
        >
          {children ?? <Outlet />}
        </motion.main>
      </div>
    </div>
  )
}
