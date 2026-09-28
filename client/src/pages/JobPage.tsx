import {
  BadgeCheck,
  Briefcase,
  Building2,
  CheckCircle2,
  ClipboardPaste,
  Compass,
  Gauge,
  ListChecks,
  RefreshCw,
  Target,
  Trash2,
  Upload,
} from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { AppShell } from '../components/layout/AppShell'
import { Badge, Button, Card, EmptyState, ErrorState, Field, Input, Modal, ProgressBar, SectionHeader } from '../components/ui/primitives'
import { ApiError, api } from '../lib/api'
import { formatDate } from '../lib/format'
import type { JobRecord } from '../lib/types'
import { useToast } from '../state/ToastContext'

export default function JobPage() {
  const toast = useToast()
  const fileRef = useRef<HTMLInputElement | null>(null)
  const [job, setJob] = useState<JobRecord | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [textOpen, setTextOpen] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const [form, setForm] = useState({ title: '', company: '', description: '' })
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const response = await api.getJob()
      setJob(response.job)
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'We could not load your job description.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const analyseText = async () => {
    const errors: Record<string, string> = {}
    if (!form.title.trim()) errors.title = 'Job title is required for role alignment scoring'
    if (form.description.trim().length < 120) errors.description = 'Paste the full job description (at least a few lines)'
    setFieldErrors(errors)
    if (Object.keys(errors).length) return

    setBusy(true)
    setError(null)
    try {
      const response = await api.analyzeJob({ title: form.title.trim(), company: form.company.trim() || undefined, description: form.description.trim() })
      setJob(response.job)
      setTextOpen(false)
      setForm({ title: '', company: '', description: '' })
      toast.success('Job description analysed', `${response.job.parsed_requirements?.required_skills?.length ?? 0} required skills identified.`)
    } catch (caught) {
      const message = caught instanceof ApiError ? caught.message : 'We could not analyse that job description.'
      setError(message)
      toast.error('Analysis failed', message)
    } finally {
      setBusy(false)
    }
  }

  const uploadFile = async (file: File) => {
    setBusy(true)
    setError(null)
    try {
      const response = await api.analyzeJobFile(file, { title: form.title.trim() || undefined, company: form.company.trim() || undefined })
      setJob(response.job)
      setTextOpen(false)
      toast.success('Job description analysed', `${response.job.parsed_requirements?.required_skills?.length ?? 0} required skills identified.`)
    } catch (caught) {
      const message = caught instanceof ApiError ? caught.message : 'We could not read that file.'
      setError(message)
      toast.error('Upload failed', message)
    } finally {
      setBusy(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const remove = async () => {
    if (!job) return
    try {
      await api.deleteJob(job.id)
      setJob(null)
      setConfirmDelete(false)
      toast.success('Job description removed')
    } catch (caught) {
      toast.error('Could not remove', caught instanceof ApiError ? caught.message : 'Please try again.')
    }
  }

  const parsed = job?.parsed_requirements ?? null

  return (
    <AppShell title="Job description" subtitle="What your interview will be measured against">
      <div className="space-y-6">
        {error ? <ErrorState title="Job description problem" message={error} onRetry={() => void load()} /> : null}

        {loading ? (
          <Card>
            <div className="h-32 skeleton" />
          </Card>
        ) : job && parsed ? (
          <>
            <Card>
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0">
                  <Badge tone="success">
                    <BadgeCheck className="h-3 w-3" aria-hidden /> Ready to target
                  </Badge>
                  <h2 className="mt-3 text-lg font-semibold text-ink-50">{job.title || parsed.title || 'Target role'}</h2>
                  <p className="mt-1 flex flex-wrap items-center gap-3 text-sm text-ink-300">
                    {job.company || parsed.company ? (
                      <span className="inline-flex items-center gap-1.5">
                        <Building2 className="h-3.5 w-3.5 text-ink-500" aria-hidden />
                        {job.company ?? parsed.company}
                      </span>
                    ) : null}
                    {parsed.experience_requirements ? (
                      <span className="inline-flex items-center gap-1.5">
                        <Gauge className="h-3.5 w-3.5 text-ink-500" aria-hidden />
                        {parsed.experience_requirements}
                      </span>
                    ) : null}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2 text-2xs text-ink-500">
                    <span className="chip">Added {formatDate(job.created_at)}</span>
                    {parsed.domain ? (
                      <span className="chip">
                        <Compass className="h-3 w-3" aria-hidden /> {parsed.domain}
                      </span>
                    ) : null}
                    {parsed.seniority ? <span className="chip">{parsed.seniority}</span> : null}
                    {parsed.engine ? <span className="chip">Analysis engine: {parsed.engine}</span> : null}
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button variant="secondary" icon={<RefreshCw className="h-4 w-4" aria-hidden />} onClick={() => setTextOpen(true)}>
                    Replace
                  </Button>
                  <Button variant="ghost" icon={<Trash2 className="h-4 w-4" aria-hidden />} onClick={() => setConfirmDelete(true)}>
                    Remove
                  </Button>
                </div>
              </div>

              <div className="mt-5 grid gap-4 sm:grid-cols-3">
                {[
                  { label: 'Required skills', value: parsed.required_skills.length },
                  { label: 'Preferred skills', value: parsed.preferred_skills.length },
                  { label: 'Responsibilities', value: parsed.responsibilities.length },
                ].map((item) => (
                  <div key={item.label} className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-3">
                    <p className="text-2xs text-ink-500">{item.label}</p>
                    <p className="mt-1 text-lg font-semibold tabular-nums text-ink-100">{item.value}</p>
                  </div>
                ))}
              </div>

              <div className="mt-5">
                <p className="section-title mb-2">Extraction confidence</p>
                <ProgressBar value={Math.round((parsed.confidence ?? 0.6) * 100)} showValue />
                <p className="mt-2 text-2xs text-ink-500">
                  Role alignment (10% of your overall score) is computed from how often your answers address the required skills listed below.
                </p>
              </div>
            </Card>

            <div className="grid gap-6 lg:grid-cols-2">
              <Card>
                <SectionHeader
                  title="Required skills"
                  subtitle="Role alignment is scored against this list"
                  icon={<Target className="h-4 w-4 text-accent" aria-hidden />}
                />
                <div className="flex flex-wrap gap-1.5">
                  {parsed.required_skills.map((skill) => (
                    <span key={skill} className="chip border-accent/25 bg-accent/[0.07] text-accent-soft">
                      {skill}
                    </span>
                  ))}
                  {!parsed.required_skills.length ? <p className="text-sm text-ink-500">No required skills detected in this posting.</p> : null}
                </div>
                {parsed.preferred_skills.length ? (
                  <>
                    <p className="section-title mb-2 mt-5">Preferred / nice to have</p>
                    <div className="flex flex-wrap gap-1.5">
                      {parsed.preferred_skills.map((skill) => (
                        <span key={skill} className="chip">
                          {skill}
                        </span>
                      ))}
                    </div>
                  </>
                ) : null}
                {parsed.soft_requirements?.length ? (
                  <>
                    <p className="section-title mb-2 mt-5">Soft requirements</p>
                    <div className="flex flex-wrap gap-1.5">
                      {parsed.soft_requirements.map((item) => (
                        <span key={item} className="chip">
                          {item}
                        </span>
                      ))}
                    </div>
                  </>
                ) : null}
              </Card>

              <Card>
                <SectionHeader title="Responsibilities" icon={<ListChecks className="h-4 w-4 text-neon" aria-hidden />} />
                {parsed.responsibilities.length ? (
                  <ul className="space-y-2.5">
                    {parsed.responsibilities.map((item) => (
                      <li key={item} className="flex items-start gap-2 text-xs leading-relaxed text-ink-300">
                        <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-accent" aria-hidden />
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-ink-500">No responsibilities detected in this posting.</p>
                )}
                {parsed.keywords?.length ? <p className="mt-4 text-2xs text-ink-500">Keywords: {parsed.keywords.join(' · ')}</p> : null}
              </Card>

              <Card className="lg:col-span-2">
                <SectionHeader title="Original posting" icon={<Briefcase className="h-4 w-4 text-accent" aria-hidden />} />
                <pre className="max-h-72 overflow-auto whitespace-pre-wrap rounded-2xl border border-white/[0.06] bg-ink-900/60 p-4 text-xs leading-relaxed text-ink-300">
                  {job.description}
                </pre>
                <div className="mt-4 flex flex-wrap gap-3">
                  <Link to="/interview/setup" className="btn-primary">
                    Continue to interview setup
                  </Link>
                  <Link to="/coach" className="btn-secondary">
                    Ask the coach about this role
                  </Link>
                </div>
              </Card>
            </div>
          </>
        ) : (
          <EmptyState
            icon={<Briefcase className="h-5 w-5" aria-hidden />}
            title="Add a job description to target your interview."
            description="Paste the posting or upload a file. We extract the required skills, responsibilities and seniority so your interview — and your role-alignment score — match the actual job."
            action={
              <div className="flex flex-wrap justify-center gap-3">
                <Button icon={<ClipboardPaste className="h-4 w-4" aria-hidden />} onClick={() => setTextOpen(true)}>
                  Paste job description
                </Button>
                <Button variant="secondary" icon={<Upload className="h-4 w-4" aria-hidden />} onClick={() => fileRef.current?.click()} loading={busy}>
                  Upload PDF / DOCX / TXT
                </Button>
              </div>
            }
          />
        )}

        <input
          ref={fileRef}
          type="file"
          accept=".pdf,.docx,.txt,.md"
          className="sr-only"
          onChange={(event) => {
            const file = event.target.files?.[0]
            if (file) void uploadFile(file)
          }}
        />

        {busy ? (
          <Card>
            <p className="text-sm font-medium text-ink-100">Analysing the job description…</p>
            <div className="mt-3">
              <ProgressBar value={88} label="Extracting requirements" />
            </div>
          </Card>
        ) : null}
      </div>

      <Modal
        open={textOpen}
        onClose={() => setTextOpen(false)}
        title={job ? 'Replace job description' : 'Add job description'}
        description="Paste the posting exactly as the company wrote it — the more detail, the better the match."
        size="lg"
        footer={
          <>
            <Button variant="ghost" onClick={() => setTextOpen(false)}>
              Cancel
            </Button>
            <Button loading={busy} onClick={() => void analyseText()} icon={<Upload className="h-4 w-4" aria-hidden />}>
              Analyse job description
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Job title" htmlFor="job-title" required error={fieldErrors.title}>
              <Input
                id="job-title"
                value={form.title}
                onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))}
                placeholder="Machine Learning Engineer"
              />
            </Field>
            <Field label="Company" htmlFor="job-company">
              <Input
                id="job-company"
                value={form.company}
                onChange={(event) => setForm((current) => ({ ...current, company: event.target.value }))}
                placeholder="VozLook Studios"
              />
            </Field>
          </div>
          <Field label="Job description" htmlFor="job-text" required error={fieldErrors.description}>
            <textarea
              id="job-text"
              rows={12}
              className="input-base text-xs leading-relaxed"
              value={form.description}
              onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))}
              placeholder={'About the role…\n\nResponsibilities:\n- Build and deploy ML models…\n\nRequirements:\n- Strong Python, SQL, PyTorch…'}
            />
          </Field>
          <button type="button" className="btn-ghost !px-3 !py-2 text-xs" onClick={() => void fileRef.current?.click()}>
            <Upload className="h-3.5 w-3.5" aria-hidden /> Or upload a file instead
          </button>
          <p className="text-2xs text-ink-500">Uploaded files: PDF, DOCX, TXT or MD up to 10 MB.</p>
        </div>
      </Modal>

      <Modal
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title="Remove this job description?"
        description="Role alignment scoring will fall back to your target role until you add a new one. Past reports keep their scores."
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmDelete(false)}>
              Keep it
            </Button>
            <Button variant="danger" onClick={() => void remove()}>
              Remove
            </Button>
          </>
        }
      />
    </AppShell>
  )
}
