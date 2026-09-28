import { motion } from 'framer-motion'
import {
  ArrowRight,
  BarChart3,
  Bot,
  FileText,
  Gauge,
  Mic,
  Route as RouteIcon,
  ShieldCheck,
  Sparkles,
  Target,
  Video,
} from 'lucide-react'
import { Link } from 'react-router-dom'
import { BRAND } from '../lib/constants'
import { useAuth } from '../state/AuthContext'
import { Badge, Button } from '../components/ui/primitives'

const STEPS = [
  { title: 'Upload your résumé', description: 'We read your skills, projects and experience into a structured candidate profile.', icon: FileText },
  { title: 'Choose the job', description: 'Paste a job description and we extract the requirements that matter for that role.', icon: Target },
  { title: 'Take the interview', description: 'Text, voice or video — the AI interviewer adapts and asks follow-ups.', icon: Mic },
  { title: 'Get AI feedback', description: 'Scores, question-by-question review and a downloadable practice report.', icon: Bot },
  { title: 'Improve and retake', description: 'Track your trends over time with a personalised study plan.', icon: RouteIcon },
]

const FEATURES = [
  { title: 'Résumé-based questions', description: 'Questions anchored to your own projects, internships and skills — not a generic list.', icon: FileText },
  { title: 'Adaptive interviews', description: 'Difficulty and follow-ups respond to how you actually answered.', icon: Gauge },
  { title: 'Voice interviews', description: 'The interviewer speaks, your answer is transcribed, and delivery signals are measured.', icon: Mic },
  { title: 'Video practice', description: 'Optional camera mode with on-device delivery observations you can switch off.', icon: Video },
  { title: 'Answer-level AI feedback', description: 'Relevance, technical depth, completeness, clarity and structure for every single answer.', icon: Bot },
  { title: 'Progress tracking', description: 'Real metrics over time, recurring weak topics across sessions, and an improvement plan.', icon: BarChart3 },
]

export default function Landing() {
  const { user, profile } = useAuth()
  const primaryTarget = user ? (profile?.onboarding_completed ? '/dashboard' : '/onboarding') : '/signup'

  return (
    <div className="min-h-screen w-full overflow-x-hidden">
      <header className="sticky top-0 z-40 border-b border-white/[0.06] bg-ink-950/75 backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-accent-sheen shadow-glow">
              <Sparkles className="h-5 w-5 text-white" aria-hidden />
            </span>
            <span>
              <span className="block text-sm font-semibold text-ink-50">{BRAND.product}</span>
              <span className="block text-2xs text-ink-500">by {BRAND.vendor}</span>
            </span>
          </div>
          <nav className="hidden items-center gap-6 text-sm text-ink-300 md:flex" aria-label="Marketing navigation">
            <a href="#how" className="transition-colors hover:text-white">
              How it works
            </a>
            <a href="#features" className="transition-colors hover:text-white">
              Features
            </a>
            <a href="#trust" className="transition-colors hover:text-white">
              Responsible AI
            </a>
          </nav>
          <div className="flex items-center gap-2">
            {user ? (
              <Link to={primaryTarget} className="btn-primary !px-4 !py-2 text-xs sm:text-sm">
                Go to dashboard
              </Link>
            ) : (
              <>
                <Link to="/login" className="btn-ghost !px-3 !py-2 text-xs sm:text-sm">
                  Sign in
                </Link>
                <Link to="/signup" className="btn-primary !px-4 !py-2 text-xs sm:text-sm">
                  Start practicing
                </Link>
              </>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl px-4 sm:px-6">
        {/* Hero */}
        <section className="relative py-14 sm:py-20">
          <div className="pointer-events-none absolute inset-0 -z-10 bg-grid-fade" aria-hidden />
          <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }} className="max-w-3xl">
            <Badge tone="accent">
              <Sparkles className="h-3 w-3" aria-hidden /> AI mock interviews that explain your score
            </Badge>
            <h1 className="mt-5 text-3xl font-semibold leading-tight tracking-tight text-ink-50 sm:text-5xl">
              Your AI Interviewer.
              <br />
              <span className="text-gradient">Your Personal Interview Coach.</span>
            </h1>
            <p className="mt-5 max-w-2xl text-base leading-relaxed text-ink-300 sm:text-lg">
              Practice realistic interviews built from your résumé and the job you actually want. Receive personalised, evidence-based feedback
              and improve with every attempt.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link to={primaryTarget} className="btn-primary !px-5 !py-3">
                Start Practicing
                <ArrowRight className="h-4 w-4" aria-hidden />
              </Link>
              <a href="#how" className="btn-secondary !px-5 !py-3">
                See How It Works
              </a>
            </div>
            <dl className="mt-10 grid grid-cols-2 gap-4 sm:grid-cols-4">
              {[
                ['Interview modes', 'Text · Voice · Video'],
                ['Question types', 'Technical · HR · Behavioral'],
                ['Feedback', 'Question by question'],
                ['Report', 'Downloadable PDF'],
              ].map(([label, value]) => (
                <div key={label} className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-3">
                  <dt className="text-2xs uppercase tracking-wider text-ink-500">{label}</dt>
                  <dd className="mt-1 text-xs font-medium text-ink-100">{value}</dd>
                </div>
              ))}
            </dl>
          </motion.div>
        </section>

        {/* How it works */}
        <section id="how" className="scroll-mt-20 py-12 sm:py-16">
          <h2 className="section-title">How it works</h2>
          <p className="mt-2 max-w-2xl text-lg font-medium text-ink-100">Five steps from application anxiety to interview readiness.</p>
          <ol className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            {STEPS.map((step, index) => (
              <motion.li
                key={step.title}
                initial={{ opacity: 0, y: 12 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: '-60px' }}
                transition={{ delay: index * 0.06 }}
                className="glass-card p-4"
              >
                <span className="flex h-9 w-9 items-center justify-center rounded-2xl bg-accent/15 text-sm font-semibold text-accent-soft">
                  {index + 1}
                </span>
                <h3 className="mt-3 flex items-center gap-2 text-sm font-semibold text-ink-50">
                  <step.icon className="h-4 w-4 text-neon" aria-hidden />
                  {step.title}
                </h3>
                <p className="mt-2 text-xs leading-relaxed text-ink-400">{step.description}</p>
              </motion.li>
            ))}
          </ol>
        </section>

        {/* Features */}
        <section id="features" className="scroll-mt-20 py-12 sm:py-16">
          <h2 className="section-title">Features</h2>
          <p className="mt-2 max-w-2xl text-lg font-medium text-ink-100">Everything a serious practice loop needs.</p>
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((feature) => (
              <div key={feature.title} className="glass-card card-hover p-5">
                <span className="flex h-10 w-10 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04] text-accent-soft">
                  <feature.icon className="h-5 w-5" aria-hidden />
                </span>
                <h3 className="mt-4 text-sm font-semibold text-ink-50">{feature.title}</h3>
                <p className="mt-2 text-xs leading-relaxed text-ink-400">{feature.description}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Responsible AI */}
        <section id="trust" className="scroll-mt-20 py-12 sm:py-16">
          <div className="glass-card p-6 sm:p-8">
            <div className="flex flex-wrap items-start justify-between gap-6">
              <div className="max-w-2xl">
                <h2 className="flex items-center gap-2 text-lg font-semibold text-ink-50">
                  <ShieldCheck className="h-5 w-5 text-success" aria-hidden />
                  Built as a practice tool, not a verdict
                </h2>
                <p className="mt-3 text-sm leading-relaxed text-ink-300">
                  VozLook InterviewAI scores your answers and delivery so you can rehearse. It never claims to predict hiring outcomes, and it
                  never assesses personality, honesty, intelligence or mental state. Video observations are optional, computed on your device,
                  and presented as rough practice signals you can turn off.
                </p>
                <p className="mt-3 text-xs leading-relaxed text-ink-500">
                  Scoring is transparent: every dimension has a documented formula you can read inside each report.
                </p>
              </div>
              <div className="w-full max-w-xs space-y-2">
                {['No hiring predictions', 'No personality claims', 'Camera is always optional', 'Your data stays yours'].map((item) => (
                  <p key={item} className="flex items-center gap-2 rounded-2xl border border-white/[0.07] bg-white/[0.02] px-3 py-2 text-xs text-ink-200">
                    <ShieldCheck className="h-3.5 w-3.5 text-success" aria-hidden />
                    {item}
                  </p>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="py-12 sm:py-16">
          <div className="glass-card relative overflow-hidden p-8 text-center sm:p-12">
            <div className="pointer-events-none absolute inset-0 -z-10 bg-grid-fade" aria-hidden />
            <h2 className="text-2xl font-semibold text-ink-50 sm:text-3xl">Ready for your next interview?</h2>
            <p className="mx-auto mt-3 max-w-xl text-sm leading-relaxed text-ink-300">
              Create an account, upload your résumé and run a personalised mock interview in under five minutes.
            </p>
            <div className="mt-7 flex flex-wrap justify-center gap-3">
              <Link to={primaryTarget} className="btn-primary !px-6 !py-3">
                Start Practicing
              </Link>
              <Link to="/login" className="btn-secondary !px-6 !py-3">
                I already have an account
              </Link>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-white/[0.06] py-5">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 text-center sm:px-6 sm:text-left">
          <p className="text-xs font-medium text-ink-200">{BRAND.vendor}</p>
          <p className="text-2xs text-ink-500">{BRAND.studioLine}</p>
          <p className="text-2xs text-ink-600">
            © {new Date().getFullYear()} {BRAND.vendor}. Practice metrics only — not a hiring decision.
          </p>
        </div>
      </footer>
    </div>
  )
}
