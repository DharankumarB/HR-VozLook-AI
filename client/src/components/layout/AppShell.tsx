import { AnimatePresence, motion } from 'framer-motion'
import {
  BarChart3,
  Bot,
  Briefcase,
  FileText,
  History,
  LayoutDashboard,
  LogOut,
  Menu,
  Mic,
  Settings,
  ShieldCheck,
  Sparkles,
  UserRound,
  X,
} from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom'
import { BRAND } from '../../lib/constants'
import { fileUrl } from '../../lib/api'
import { initials } from '../../lib/format'
import { useAuth } from '../../state/AuthContext'
import { Button } from '../ui/primitives'

const NAV_ITEMS = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/resume', label: 'Résumé', icon: FileText },
  { to: '/job', label: 'Target job', icon: Briefcase },
  { to: '/interview/setup', label: 'New interview', icon: Mic },
  { to: '/history', label: 'History', icon: History },
  { to: '/progress', label: 'Progress', icon: BarChart3 },
  { to: '/coach', label: 'AI coach', icon: Bot },
  { to: '/profile', label: 'Profile', icon: UserRound },
  { to: '/settings', label: 'Settings', icon: Settings },
]

const MOBILE_ITEMS = [
  { to: '/dashboard', label: 'Home', icon: LayoutDashboard },
  { to: '/interview/setup', label: 'Practice', icon: Mic },
  { to: '/history', label: 'History', icon: History },
  { to: '/coach', label: 'Coach', icon: Bot },
  { to: '/profile', label: 'You', icon: UserRound },
]

export function BrandMark({ compact = false }: { compact?: boolean }) {
  return (
    <Link to="/dashboard" className="group flex items-center gap-3" aria-label={`${BRAND.product} home`}>
      <span className="relative flex h-10 w-10 items-center justify-center rounded-2xl bg-accent-sheen shadow-glow">
        <Sparkles className="h-5 w-5 text-white" aria-hidden />
      </span>
      {!compact ? (
        <span className="min-w-0">
          <span className="block truncate text-sm font-semibold tracking-tight text-ink-50">{BRAND.product}</span>
          <span className="block truncate text-2xs text-ink-500">{BRAND.tagline}</span>
        </span>
      ) : null}
    </Link>
  )
}

function NavList({ onNavigate, isAdmin }: { onNavigate?: () => void; isAdmin: boolean }) {
  return (
    <nav className="space-y-1" aria-label="Main navigation">
      {[...NAV_ITEMS, ...(isAdmin ? [{ to: BRAND.adminSurface, label: 'Admin console', icon: ShieldCheck }] : [])].map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          onClick={onNavigate}
          className={({ isActive }) =>
            `group flex items-center gap-3 rounded-2xl px-3 py-2.5 text-sm font-medium transition-colors ${
              isActive ? 'bg-accent/15 text-white ring-1 ring-inset ring-accent/40' : 'text-ink-300 hover:bg-white/[0.05] hover:text-white'
            }`
          }
        >
          <item.icon className="h-4 w-4 shrink-0" aria-hidden />
          <span className="truncate">{item.label}</span>
        </NavLink>
      ))}
    </nav>
  )
}

export function AppShell({
  children,
  title,
  subtitle,
  actions,
}: {
  children: ReactNode
  title?: string
  subtitle?: string
  /** Extra controls rendered in the top bar (used by the live interview screen). */
  actions?: ReactNode
}) {
  const { profile, user, logout, isAdmin } = useAuth()
  const [drawerOpen, setDrawerOpen] = useState(false)
  const location = useLocation()
  const navigate = useNavigate()

  useEffect(() => {
    setDrawerOpen(false)
  }, [location.pathname])

  const avatar = fileUrl(profile?.avatar_url)
  const displayName = profile?.full_name || user?.email?.split('@')[0] || 'Candidate'

  const handleLogout = async () => {
    await logout()
    navigate('/login', { replace: true })
  }

  return (
    <div className="flex min-h-screen w-full max-w-full">
      {/* Desktop / tablet sidebar */}
      <aside className="hidden w-64 shrink-0 border-r border-white/[0.06] bg-ink-950/60 px-4 py-6 lg:block xl:w-72">
        <div className="flex h-full flex-col">
          <BrandMark />
          <div className="mt-8 flex-1">
            <NavList isAdmin={isAdmin} />
          </div>
          <div className="space-y-3 rounded-2xl border border-white/[0.07] bg-white/[0.03] p-3">
            <div className="flex items-center gap-3">
              <span className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-xl bg-accent/20 text-xs font-semibold text-accent-soft">
                {avatar ? <img src={avatar} alt="" className="h-full w-full object-cover" /> : initials(displayName)}
              </span>
              <span className="min-w-0">
                <span className="block truncate text-xs font-semibold text-ink-100">{displayName}</span>
                <span className="block truncate text-2xs text-ink-500">{profile?.target_role || 'Set a target role'}</span>
              </span>
            </div>
            <Button variant="ghost" size="sm" fullWidth icon={<LogOut className="h-3.5 w-3.5" aria-hidden />} onClick={handleLogout}>
              Sign out
            </Button>
          </div>
        </div>
      </aside>

      {/* Mobile drawer */}
      <AnimatePresence>
        {drawerOpen ? (
          <>
            <motion.div
              className="fixed inset-0 z-40 bg-ink-950/80 backdrop-blur-sm lg:hidden"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setDrawerOpen(false)}
              aria-hidden
            />
            <motion.aside
              className="fixed inset-y-0 left-0 z-50 w-72 max-w-[85vw] border-r border-white/[0.08] bg-surface px-4 py-5 lg:hidden"
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ type: 'spring', damping: 26, stiffness: 260 }}
              aria-label="Navigation drawer"
            >
              <div className="flex items-center justify-between">
                <BrandMark />
                <button
                  type="button"
                  onClick={() => setDrawerOpen(false)}
                  className="rounded-xl p-2 text-ink-300 hover:bg-white/10 hover:text-white"
                  aria-label="Close navigation"
                >
                  <X className="h-4 w-4" aria-hidden />
                </button>
              </div>
              <div className="mt-6">
                <NavList isAdmin={isAdmin} onNavigate={() => setDrawerOpen(false)} />
              </div>
              <Button
                variant="secondary"
                size="sm"
                fullWidth
                className="mt-6"
                icon={<LogOut className="h-3.5 w-3.5" aria-hidden />}
                onClick={handleLogout}
              >
                Sign out
              </Button>
            </motion.aside>
          </>
        ) : null}
      </AnimatePresence>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Top bar */}
        <header className="sticky top-0 z-30 border-b border-white/[0.06] bg-ink-950/80 backdrop-blur-xl">
          <div className="flex items-center gap-3 px-4 py-3 sm:px-6">
            <button
              type="button"
              onClick={() => setDrawerOpen(true)}
              className="rounded-xl border border-white/10 p-2 text-ink-200 hover:border-white/25 hover:text-white lg:hidden"
              aria-label="Open navigation menu"
            >
              <Menu className="h-4 w-4" aria-hidden />
            </button>
            <div className="min-w-0 flex-1">
              {title ? <h1 className="truncate text-sm font-semibold text-ink-50 sm:text-base">{title}</h1> : <BrandMark compact />}
              {subtitle ? <p className="truncate text-2xs text-ink-500">{subtitle}</p> : null}
            </div>
            <div className="flex items-center gap-2">
              {actions}
              {isAdmin ? (
                <Link to={BRAND.adminSurface} className="btn-secondary hidden !px-3 !py-2 text-xs sm:inline-flex" title="Administrator console">
                  <ShieldCheck className="h-3.5 w-3.5" aria-hidden />
                  Admin
                </Link>
              ) : null}
              <Link to="/interview/setup" className="btn-primary hidden !px-3 !py-2 text-xs sm:inline-flex">
                <Mic className="h-3.5 w-3.5" aria-hidden />
                Start interview
              </Link>
            </div>
          </div>
        </header>

        <main className="flex-1 px-4 pb-28 pt-5 sm:px-6 sm:pb-16 lg:pb-10">{children}</main>
      </div>

      {/* Mobile bottom navigation */}
      <nav
        className="fixed inset-x-0 bottom-0 z-40 border-t border-white/[0.08] bg-ink-950/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl lg:hidden"
        aria-label="Primary"
      >
        <div className="grid grid-cols-5">
          {MOBILE_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `flex flex-col items-center gap-1 px-1 py-2.5 text-2xs font-medium transition-colors ${
                  isActive ? 'text-accent' : 'text-ink-400 hover:text-ink-100'
                }`
              }
            >
              <item.icon className="h-5 w-5" aria-hidden />
              <span className="truncate">{item.label}</span>
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  )
}
