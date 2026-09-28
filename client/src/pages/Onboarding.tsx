import { motion } from 'framer-motion'
import { ArrowLeft, ArrowRight, Briefcase, Check, GraduationCap, MessageSquare, Mic, Sparkles, Target, UserRound, Video } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button, Card, ErrorState, Field, Input, ProgressBar, SegmentedControl } from '../components/ui/primitives'
import { BRAND, EXPERIENCE_LEVELS, INTERVIEW_MODES } from '../lib/constants'
import type { InterviewMode } from '../lib/types'
import { useAuth } from '../state/AuthContext'
import { useToast } from '../state/ToastContext'

const MODE_ICONS: Record<string, JSX.Element> = {
  message: <MessageSquare className="h-3.5 w-3.5" aria-hidden />,
  mic: <Mic className="h-3.5 w-3.5" aria-hidden />,
  video: <Video className="h-3.5 w-3.5" aria-hidden />,
}

const STEPS = [
  { title: 'Your name', description: 'This appears on your interview reports.', icon: UserRound },
  { title: 'Target role', description: 'The job you are preparing for right now.', icon: Target },
  { title: 'Experience level', description: 'So questions match your stage.', icon: GraduationCap },
  { title: 'Preferred mode', description: 'You can change this before every interview.', icon: MessageSquare },
]

export default function Onboarding() {
  const { profile, updateProfile, user } = useAuth()
  const toast = useToast()
  const navigate = useNavigate()
  const [step, setStep] = useState(0)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [fullName, setFullName] = useState(profile?.full_name ?? '')
  const [targetRole, setTargetRole] = useState(profile?.target_role ?? '')
  const [companyField, setCompanyField] = useState(profile?.company ?? '')
  const [experienceLevel, setExperienceLevel] = useState(profile?.experience_level ?? 'Fresher')
  const [mode, setMode] = useState<InterviewMode>((profile?.preferred_mode as InterviewMode) ?? 'text')

  useEffect(() => {
    if (profile?.full_name && !fullName) setFullName(profile.full_name)
    if (profile?.target_role && !targetRole) setTargetRole(profile.target_role)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile])

  const progress = useMemo(() => ((step + 1) / STEPS.length) * 100, [step])

  const canContinue = useMemo(() => {
    if (step === 0) return fullName.trim().length > 1
    if (step === 1) return targetRole.trim().length > 1
    return true
  }, [step, fullName, targetRole])

  const finish = async () => {
    setSaving(true)
    setError(null)
    try {
      await updateProfile({
        full_name: fullName.trim(),
        target_role: targetRole.trim(),
        company: companyField.trim() || undefined,
        experience_level: experienceLevel as (typeof EXPERIENCE_LEVELS)[number],
        preferred_mode: mode,
        onboarding_completed: true,
      })
      toast.success('Profile saved', 'Your interviews will be personalised from here.')
      navigate('/resume', { replace: true })
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'We could not save your profile. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-2xl flex-col justify-center px-4 py-10 sm:px-6">
      <div className="mb-8">
        <span className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-accent-sheen shadow-glow">
            <Sparkles className="h-5 w-5 text-white" aria-hidden />
          </span>
          <span>
            <span className="block text-sm font-semibold text-ink-50">{BRAND.product}</span>
            <span className="block text-2xs text-ink-500">Welcome {user?.email ? `· ${user.email}` : ''}</span>
          </span>
        </span>
      </div>

      <Card>
        <div className="mb-6 space-y-3">
          <div className="flex items-center justify-between text-xs text-ink-400">
            <span>
              Step {step + 1} of {STEPS.length}
            </span>
            <span>{STEPS[step]!.title}</span>
          </div>
          <ProgressBar value={progress} tone="none" size="sm" />
        </div>

        {error ? (
          <div className="mb-5">
            <ErrorState title="Could not save" message={error} onRetry={() => void finish()} />
          </div>
        ) : null}

        <motion.div key={step} initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.25 }}>
          <h1 className="flex items-center gap-2 text-xl font-semibold text-ink-50">
            {(() => {
              const Icon = STEPS[step]!.icon
              return <Icon className="h-5 w-5 text-accent" aria-hidden />
            })()}
            {STEPS[step]!.title}
          </h1>
          <p className="mt-1.5 text-sm text-ink-400">{STEPS[step]!.description}</p>

          <div className="mt-6">
            {step === 0 ? (
              <Field label="Full name" htmlFor="onboarding-name" required>
                <Input
                  id="onboarding-name"
                  value={fullName}
                  onChange={(event) => setFullName(event.target.value)}
                  placeholder="Arjun Mehta"
                  autoComplete="name"
                  autoFocus
                />
              </Field>
            ) : null}

            {step === 1 ? (
              <div className="space-y-5">
                <Field label="Target job role" htmlFor="onboarding-role" required hint="e.g. Machine Learning Engineer">
                  <Input
                    id="onboarding-role"
                    value={targetRole}
                    onChange={(event) => setTargetRole(event.target.value)}
                    placeholder="Machine Learning Engineer"
                    autoFocus
                  />
                </Field>
                <Field label="Target company" htmlFor="onboarding-company" hint="Optional">
                  <Input
                    id="onboarding-company"
                    value={companyField}
                    onChange={(event) => setCompanyField(event.target.value)}
                    placeholder="VozLook Studios"
                  />
                </Field>
                <div className="flex flex-wrap gap-1.5">
                  {['AI/ML Engineer', 'Data Scientist', 'Software Developer', 'Frontend Developer', 'Cybersecurity Analyst', 'Cloud Engineer'].map(
                    (suggestion) => (
                      <button
                        key={suggestion}
                        type="button"
                        onClick={() => setTargetRole(suggestion)}
                        className="chip transition-colors hover:border-accent/40 hover:text-white"
                      >
                        {suggestion}
                      </button>
                    ),
                  )}
                </div>
              </div>
            ) : null}

            {step === 2 ? (
              <SegmentedControl
                label="Experience level"
                value={experienceLevel}
                onChange={setExperienceLevel}
                columns="grid-cols-1 sm:grid-cols-2"
                options={EXPERIENCE_LEVELS.map((level) => ({
                  value: level,
                  label: level,
                  description:
                    level === 'Student'
                      ? 'Still studying, preparing for placements'
                      : level === 'Fresher'
                        ? 'Graduated, looking for the first role'
                        : level === '1-2 years'
                          ? 'Early career, shipping features'
                          : level === '3-5 years'
                            ? 'Mid-level, owning projects'
                            : 'Senior, leading and mentoring',
                }))}
              />
            ) : null}

            {step === 3 ? (
              <SegmentedControl
                label="Preferred interview mode"
                value={mode}
                onChange={(value) => setMode(value as InterviewMode)}
                columns="grid-cols-1 sm:grid-cols-3"
                options={INTERVIEW_MODES.map((option) => ({
                  value: option.value,
                  label: option.label,
                  description: option.description,
                  icon: MODE_ICONS[option.icon],
                }))}
              />
            ) : null}
          </div>
        </motion.div>

        <div className="mt-8 flex flex-wrap items-center justify-between gap-3">
          <Button variant="ghost" onClick={() => setStep((value) => Math.max(0, value - 1))} disabled={step === 0 || saving} icon={<ArrowLeft className="h-4 w-4" aria-hidden />}>
            Back
          </Button>
          <div className="flex items-center gap-2">
            {step < STEPS.length - 1 ? (
              <Button
                onClick={() => setStep((value) => value + 1)}
                disabled={!canContinue}
                icon={<ArrowRight className="h-4 w-4" aria-hidden />}
              >
                Continue
              </Button>
            ) : (
              <Button onClick={() => void finish()} loading={saving} icon={<Check className="h-4 w-4" aria-hidden />}>
                Save profile
              </Button>
            )}
          </div>
        </div>

        <div className="mt-5 flex items-center gap-2 text-2xs text-ink-500">
          <Briefcase className="h-3.5 w-3.5" aria-hidden />
          You can change all of this later in Profile and Settings.
        </div>
      </Card>
    </div>
  )
}
