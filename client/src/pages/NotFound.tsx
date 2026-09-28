import { Compass, Home } from 'lucide-react'
import { Link } from 'react-router-dom'
import { BRAND } from '../lib/constants'

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-6 text-center">
      <span className="flex h-14 w-14 items-center justify-center rounded-3xl bg-accent-sheen shadow-glow">
        <Compass className="h-6 w-6 text-white" aria-hidden />
      </span>
      <p className="mt-6 text-2xs font-semibold uppercase tracking-[0.24em] text-ink-500">404</p>
      <h1 className="mt-2 text-2xl font-semibold text-ink-50">This page is not part of the interview</h1>
      <p className="mt-3 max-w-md text-sm leading-relaxed text-ink-400">
        The link may be broken or the page may have moved. Head back to your dashboard to continue practising.
      </p>
      <div className="mt-7 flex flex-wrap justify-center gap-3">
        <Link to="/dashboard" className="btn-primary !px-5 !py-3">
          <Home className="h-4 w-4" aria-hidden /> Go to dashboard
        </Link>
        <Link to="/" className="btn-secondary !px-5 !py-3">
          Visit the landing page
        </Link>
      </div>
      <p className="mt-8 text-2xs text-ink-600">
        {BRAND.product} · {BRAND.vendor}
      </p>
    </div>
  )
}
