import { AlertTriangle, Briefcase, FileText, Gauge, MessageSquare, Mic, Play, Settings2, Sparkles, Video } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { AppShell } from '../components/layout/AppShell'
import { Button, Card, ErrorState, Field, Input, SegmentedControl, SectionHeader, Select } from '../components/ui/primitives'
import { ApiError, api } from '../lib/api'
import { DIFFICULTIES, INTERVIEW_MODES, INTERVIEW_TYPES, QUESTION_COUNTS } from '../lib/constants'
import type { DifficultySetting, InterviewMode, InterviewType, JobRecord, ResumeRecord } from '../lib/types'
import { useAuth } from '../state/AuthContext'
import { useToast } from '../state/ToastContext'

const MODE_ICONS: Record<string, JSX.Element> = {
  message: <MessageSquare className="h-3.5 w-3.5" aria-hidden />,
  mic: <Mic className="h-3.5 w-3.5" aria-hidden />,
  video: <Video className="h-3.5 w-3.5" aria-hidden />,
}

export default function InterviewSetup() {
  const { profile } = useAuth()
  const toast = useToast()
  const navigate = useNavigate()

  const [resume, setResume] = useState<ResumeRecord | null>(null)
  const [job, setJob] = useState<JobRecord | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)

  const [config, setConfig] = useState({
    interview_type: 'mixed' as InterviewType | 'mixed',
    difficulty: 'medium' as DifficultySetting,
    interview_mode: ((profile?.preferred_mode as InterviewMode) ?? 'text') as InterviewMode,
    question_count: 5,
    job_role: '',
    company: '',
    focus_areas: '',
    adaptive: true,
  })

  useEffect(() => {
    if (profile?.preferred_mode) setConfig((current) => ({ ...current, interview_mode: profile.preferred_mode as InterviewMode }))
    if (profile?.target_role) setConfig((current) => ({ ...current, job_role: profile.target_role! }))
    if (profile?.company) setConfig((current) => ({ ...current, company: profile.company! }))
  }, [profile])

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      setLoading(true)
      setError(null)
      try {
        const [resumeResponse, jobResponse] = await Promise.all([api.getResume(), api.getJob()])
        if (cancelled) return
        setResume(resumeResponse.resume)
        setJob(jobResponse.job)
        if (jobResponse.job) {
          const record = jobResponse.job
          setConfig((current) => ({
            ...current,
            job_role: current.job_role || record.title || record.parsed_requirements?.title || '',
            company: current.company || record.company || record.parsed_requirements?.company || '',
          }))
        }
      } catch (caught) {
        if (!cancelled) setError(caught instanceof ApiError ? caught.message : 'We could not load your interview context.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [])

  const jobSkills = job?.parsed_requirements?.required_skills ?? []

  const ready = Boolean(resume?.parsed_data) && config.job_role.trim().length > 1

  const start = async () => {
    setCreateError(null)
    if (!resume?.parsed_data) {
      setCreateError('Upload and analyse your résumé first — questions are built from it.')
      return
    }
    if (config.job_role.trim().length < 2) {
      setCreateError('Add the job role you are interviewing for.')
      return
    }
    setCreating(true)
    try {
      const response = await api.createInterview({
        interviewType: config.interview_type,
        difficulty: config.difficulty,
        mode: config.interview_mode,
        questionCount: config.question_count,
        jobRole: config.job_role.trim(),
        settings: {
          company: config.company.trim() || null,
          adaptive: config.adaptive,
          resume_id: resume.id,
          job_description_id: job?.id ?? null,
          focus_areas: config.focus_areas
            .split(',')
            .map((item) => item.trim())
            .filter(Boolean),
        },
      })
      toast.success('Interview ready', 'The AI interviewer will start with your first question.')
      navigate(`/interview/${response.interview.id}`, { replace: true })
    } catch (caught) {
      setCreateError(caught instanceof ApiError ? caught.message : 'We could not create the interview. Please try again.')
    } finally {
      setCreating(false)
    }
  }

  const prerequisites = useMemo(
    () => [
      {
        ok: Boolean(resume?.parsed_data),
        label: 'Résumé analysed',
        detail: resume?.parsed_data ? `${resume.parsed_data.skills.length} skills, ${resume.parsed_data.projects.length} projects` : 'Required — upload it first',
        to: '/resume',
      },
      {
        ok: Boolean(job?.parsed_requirements),
        label: 'Job description',
        detail: job?.parsed_requirements ? `${job.parsed_requirements.required_skills.length} required skills` : 'Optional, but improves role alignment scoring',
        to: '/job',
      },
      {
        ok: Boolean(config.job_role.trim()),
        label: 'Target role',
        detail: config.job_role || 'Set a role so questions match the job',
        to: '/profile',
      },
    ],
    [resume, job, config.job_role],
  )

  return (
    <AppShell title="Interview setup" subtitle="Configure the session — you can change this before every attempt">
      <div className="grid gap-6 lg:grid-cols-[1.5fr_1fr]">
        <div className="space-y-6">
          <Card>
            <SectionHeader
              title="Session configuration"
              icon={<Settings2 className="h-4 w-4 text-accent" aria-hidden />}
              subtitle="These choices shape your question mix and evaluation."
            />

            <div className="space-y-6">
              <SegmentedControl
                label="Interview type"
                value={config.interview_type}
                onChange={(value) => setConfig((current) => ({ ...current, interview_type: value as InterviewType | 'mixed' }))}
                columns="grid-cols-2 sm:grid-cols-4"
                options={INTERVIEW_TYPES.map((type) => ({ value: type.value, label: type.label, description: type.description }))}
              />

              <SegmentedControl
                label="Difficulty"
                value={config.difficulty}
                onChange={(value) => setConfig((current) => ({ ...current, difficulty: value as DifficultySetting }))}
                columns="grid-cols-3"
                options={DIFFICULTIES.map((option) => ({ value: option.value, label: option.label, description: option.description }))}
              />

              <SegmentedControl
                label="Interview mode"
                value={config.interview_mode}
                onChange={(value) => setConfig((current) => ({ ...current, interview_mode: value as InterviewMode }))}
                columns="grid-cols-1 sm:grid-cols-3"
                options={INTERVIEW_MODES.map((mode) => ({
                  value: mode.value,
                  label: mode.label,
                  description: mode.description,
                  icon: MODE_ICONS[mode.icon],
                }))}
              />

              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Number of questions" htmlFor="question-count">
                  <Select
                    id="question-count"
                    value={String(config.question_count)}
                    onChange={(event) => setConfig((current) => ({ ...current, question_count: Number(event.target.value) }))}
                    options={QUESTION_COUNTS.map((count) => ({ value: String(count), label: `${count} questions` }))}
                  />
                </Field>
                <Field label="Adaptive follow-ups" htmlFor="adaptive" hint="Follow-up questions based on how you answered">
                  <label className="input-base flex cursor-pointer items-center justify-between gap-3" htmlFor="adaptive">
                    <span className="text-sm text-ink-200">{config.adaptive ? 'Enabled' : 'Disabled'}</span>
                    <input
                      id="adaptive"
                      type="checkbox"
                      className="h-4 w-4 accent-[#7C5CFF]"
                      checked={config.adaptive}
                      onChange={(event) => setConfig((current) => ({ ...current, adaptive: event.target.checked }))}
                    />
                  </label>
                </Field>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Job role" htmlFor="setup-role" required hint="Shown on your report">
                  <Input
                    id="setup-role"
                    value={config.job_role}
                    onChange={(event) => setConfig((current) => ({ ...current, job_role: event.target.value }))}
                    placeholder="Machine Learning Engineer"
                  />
                </Field>
                <Field label="Company" htmlFor="setup-company" hint="Optional">
                  <Input
                    id="setup-company"
                    value={config.company}
                    onChange={(event) => setConfig((current) => ({ ...current, company: event.target.value }))}
                    placeholder="VozLook Studios"
                  />
                </Field>
              </div>

              <Field
                label="Focus areas"
                htmlFor="setup-focus"
                hint="Comma separated — leave blank to let the AI choose from your résumé and the job"
              >
                <Input
                  id="setup-focus"
                  value={config.focus_areas}
                  onChange={(event) => setConfig((current) => ({ ...current, focus_areas: event.target.value }))}
                  placeholder="SQL, model evaluation, system design"
                />
              </Field>
            </div>
          </Card>

          {createError ? <ErrorState title="Could not start the interview" message={createError} onRetry={() => void start()} /> : null}

          <div className="flex flex-wrap items-center gap-3">
            <Button size="lg" onClick={() => void start()} loading={creating} disabled={!ready && !loading} icon={<Play className="h-4 w-4" aria-hidden />}>
              Start Interview
            </Button>
            <Link to="/dashboard" className="btn-ghost">
              Cancel
            </Link>
          </div>

          {!ready && !loading ? (
            <p className="flex items-start gap-2 text-xs text-warning">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
              A résumé and a job role are needed before an interview can be generated.
            </p>
          ) : null}
        </div>

        <div className="space-y-6">
          <Card>
            <SectionHeader title="Your interview context" icon={<Sparkles className="h-4 w-4 text-neon" aria-hidden />} />
            {loading ? (
              <div className="h-32 skeleton" />
            ) : (
              <ul className="space-y-3">
                {prerequisites.map((item) => (
                  <li key={item.label} className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="flex items-center gap-2 text-sm font-medium text-ink-100">
                          <span className={`h-1.5 w-1.5 rounded-full ${item.ok ? 'bg-success' : 'bg-warning'}`} aria-hidden />
                          {item.label}
                        </p>
                        <p className="mt-0.5 truncate text-2xs text-ink-500">{item.detail}</p>
                      </div>
                      {!item.ok ? (
                        <Link to={item.to} className="btn-ghost !px-2.5 !py-1.5 text-2xs">
                          Fix
                        </Link>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          {resume?.parsed_data ? (
            <Card>
              <SectionHeader title="Questions will draw from" icon={<FileText className="h-4 w-4 text-accent" aria-hidden />} />
              <div className="flex flex-wrap gap-1.5">
                {jobSkills.slice(0, 12).map((skill) => (
                  <span key={skill} className="chip border-accent/25 bg-accent/[0.07] text-accent-soft">
                    {skill}
                  </span>
                ))}
                {resume.parsed_data.projects.slice(0, 4).map((project) => (
                  <span key={project.name} className="chip">
                    {project.name}
                  </span>
                ))}
              </div>
              {resume.parsed_data.skills.length ? (
                <p className="mt-3 text-2xs leading-relaxed text-ink-500">
                  Plus skills such as {resume.parsed_data.skills.slice(0, 8).join(', ')}
                  {resume.parsed_data.skills.length > 8 ? ' and more' : ''}.
                </p>
              ) : null}
            </Card>
          ) : null}

          <Card>
            <SectionHeader title="What to expect" icon={<Gauge className="h-4 w-4 text-warning" aria-hidden />} />
            <ul className="space-y-2.5 text-xs leading-relaxed text-ink-300">
              <li>The interviewer asks {config.question_count} questions{config.adaptive ? ', plus follow-ups where your answer needs depth' : ''}.</li>
              <li>Answers are analysed as soon as you submit — relevance, technical depth, completeness, clarity and structure.</li>
              <li>{config.interview_mode === 'text' ? 'You can type at your own pace.' : config.interview_mode === 'voice' ? 'The interviewer speaks; use the mic or type if your browser blocks it.' : 'Camera is optional and can be turned off at any time.'}</li>
              <li>Your report and PDF are generated when you finish the session.</li>
            </ul>
          </Card>

          {job?.parsed_requirements?.required_skills.length ? (
            <Card>
              <SectionHeader title="Role alignment" icon={<Briefcase className="h-4 w-4 text-neon" aria-hidden />} subtitle="10% of your overall score" />
              <p className="text-xs leading-relaxed text-ink-400">
                Role alignment measures how often your answers actually address the required skills below.
              </p>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {job.parsed_requirements.required_skills.map((skill) => (
                  <span key={skill} className="chip">
                    {skill}
                  </span>
                ))}
              </div>
            </Card>
          ) : null}
        </div>
      </div>
    </AppShell>
  )
}
