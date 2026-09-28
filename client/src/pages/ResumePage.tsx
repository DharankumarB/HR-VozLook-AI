import { motion } from 'framer-motion'
import {
  Award,
  BadgeCheck,
  BriefcaseBusiness,
  Building2,
  FileText,
  GraduationCap,
  Lightbulb,
  Link2,
  Mail,
  MapPin,
  Phone,
  Sparkles,
  Trash2,
} from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { AppShell } from '../components/layout/AppShell'
import { Badge, Button, Card, EmptyState, ErrorState, Modal, ProgressBar, SectionHeader } from '../components/ui/primitives'
import { FilePickerButton, FileUploader } from '../components/ui/FileUploader'
import { ApiError, api } from '../lib/api'
import { formatBytes, formatDate } from '../lib/format'
import type { ResumeRecord } from '../lib/types'
import { useToast } from '../state/ToastContext'

const ACCEPTED = '.pdf,.docx,.txt,.md'

export default function ResumePage() {
  const toast = useToast()
  const [resume, setResume] = useState<ResumeRecord | null>(null)
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [pasteOpen, setPasteOpen] = useState(false)
  const [pasteText, setPasteText] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const response = await api.getResume()
      setResume(response.resume)
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'We could not load your résumé.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const upload = async (file: File) => {
    setError(null)
    setUploading(true)
    setProgress(0)
    try {
      const response = await api.analyzeResume(file, setProgress)
      setResume(response.resume)
      toast.success('Résumé analysed', `We extracted ${response.resume.parsed_data?.skills?.length ?? 0} skills from your résumé.`)
    } catch (caught) {
      const message =
        caught instanceof ApiError
          ? caught.message
          : 'The upload failed. Check your connection and try again.'
      setError(message)
      toast.error('Upload failed', message)
    } finally {
      setUploading(false)
      setProgress(0)
    }
  }

  const onDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    setDragging(false)
    const file = event.dataTransfer.files?.[0]
    if (file) void upload(file)
  }

  const removeResume = async () => {
    if (!resume) return
    try {
      await api.deleteResume(resume.id)
      setResume(null)
      setConfirmDelete(false)
      toast.success('Résumé removed', 'Upload a new one whenever you are ready.')
    } catch (caught) {
      toast.error('Could not remove résumé', caught instanceof ApiError ? caught.message : 'Please try again.')
    }
  }

  const analysis = resume?.parsed_data ?? null

  return (
    <AppShell title="Résumé" subtitle="The foundation of every personalised question">
      <div className="space-y-6">
        {error ? <ErrorState title="Résumé problem" message={error} onRetry={() => void load()} /> : null}

        {loading ? (
          <Card>
            <div className="h-40 skeleton" />
          </Card>
        ) : resume && analysis ? (
          <>
            <Card>
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0">
                  <Badge tone="success">
                    <BadgeCheck className="h-3 w-3" aria-hidden /> Analysed
                  </Badge>
                  <h2 className="mt-3 text-lg font-semibold text-ink-50">{analysis.name || resume.file_name}</h2>
                  <p className="mt-1 text-sm text-ink-300">{analysis.headline || 'Candidate profile'}</p>
                  <div className="mt-3 flex flex-wrap gap-2 text-2xs text-ink-500">
                    <span className="chip">
                      <FileText className="h-3 w-3" aria-hidden /> {resume.file_name}
                    </span>
                    <span className="chip">{formatBytes(resume.size_bytes)}</span>
                    <span className="chip">Uploaded {formatDate(resume.created_at)}</span>
                    {analysis.extraction ? <span className="chip">{analysis.extraction.toUpperCase()} extraction</span> : null}
                    <span className="chip">Analysis engine: {analysis.engine ?? 'local'}</span>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <FilePickerButton
                    accept={ACCEPTED}
                    maxSizeMb={10}
                    disabled={uploading}
                    onSelect={(file) => void upload(file)}
                    onError={(message) => setError(message)}
                  >
                    {uploading ? 'Uploading…' : 'Replace Resume'}
                  </FilePickerButton>
                  <Button variant="ghost" icon={<Trash2 className="h-4 w-4" aria-hidden />} onClick={() => setConfirmDelete(true)}>
                    Remove
                  </Button>
                </div>
              </div>

              <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {[
                  { label: 'Skills detected', value: analysis.skills.length },
                  { label: 'Projects', value: analysis.projects.length },
                  { label: 'Experience entries', value: analysis.experience.length + analysis.internships.length },
                  { label: 'Years estimated', value: analysis.years_experience || '< 1' },
                ].map((item) => (
                  <div key={item.label} className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-3">
                    <p className="text-2xs text-ink-500">{item.label}</p>
                    <p className="mt-1 text-lg font-semibold tabular-nums text-ink-100">{item.value}</p>
                  </div>
                ))}
              </div>

              <div className="mt-5">
                <p className="section-title mb-2 flex items-center gap-2">
                  <Sparkles className="h-3.5 w-3.5 text-accent" aria-hidden /> Profile completeness
                </p>
                <ProgressBar value={Math.round((analysis.confidence ?? 0.5) * 100)} showValue />
                <p className="mt-2 text-2xs text-ink-500">
                  {Math.round((analysis.confidence ?? 0.5) * 100) >= 70
                    ? 'Strong extraction — questions will reference your projects and skills directly.'
                    : 'Add more detail to your résumé (projects, technologies, outcomes) for sharper questions.'}
                </p>
              </div>
            </Card>

            <div className="grid gap-6 lg:grid-cols-2">
              <Card>
                <SectionHeader title="Skills" icon={<Lightbulb className="h-4 w-4 text-accent" aria-hidden />} subtitle={`${analysis.skills.length} identified`} />
                <div className="flex flex-wrap gap-1.5">
                  {analysis.skills.map((skill) => (
                    <span key={skill} className="chip">
                      {skill}
                    </span>
                  ))}
                  {!analysis.skills.length ? <p className="text-sm text-ink-500">No skills detected — try a more detailed résumé.</p> : null}
                </div>
                {analysis.programming_languages.length ? (
                  <p className="mt-4 text-2xs text-ink-500">Languages: {analysis.programming_languages.join(', ')}</p>
                ) : null}
                {analysis.frameworks.length ? <p className="mt-1 text-2xs text-ink-500">Frameworks: {analysis.frameworks.join(', ')}</p> : null}
                {analysis.tools.length ? <p className="mt-1 text-2xs text-ink-500">Tools: {analysis.tools.join(', ')}</p> : null}
              </Card>

              <Card>
                <SectionHeader title="Contact & links" icon={<Mail className="h-4 w-4 text-neon" aria-hidden />} />
                <ul className="space-y-2 text-sm text-ink-200">
                  {analysis.email ? (
                    <li className="flex items-center gap-2">
                      <Mail className="h-3.5 w-3.5 text-ink-500" aria-hidden /> {analysis.email}
                    </li>
                  ) : null}
                  {analysis.phone ? (
                    <li className="flex items-center gap-2">
                      <Phone className="h-3.5 w-3.5 text-ink-500" aria-hidden /> {analysis.phone}
                    </li>
                  ) : null}
                  {analysis.location ? (
                    <li className="flex items-center gap-2">
                      <MapPin className="h-3.5 w-3.5 text-ink-500" aria-hidden /> {analysis.location}
                    </li>
                  ) : null}
                  {analysis.links?.map((link) => (
                    <li key={link} className="flex items-center gap-2 break-all">
                      <Link2 className="h-3.5 w-3.5 shrink-0 text-ink-500" aria-hidden />
                      <a href={link.startsWith('http') ? link : `https://${link}`} target="_blank" rel="noreferrer" className="text-accent-soft hover:underline">
                        {link}
                      </a>
                    </li>
                  ))}
                </ul>
                {analysis.summary ? (
                  <p className="mt-4 rounded-2xl border border-white/[0.06] bg-ink-900/50 p-3 text-xs leading-relaxed text-ink-300">{analysis.summary}</p>
                ) : null}
              </Card>

              <Card>
                <SectionHeader
                  title="Projects"
                  icon={<Building2 className="h-4 w-4 text-accent" aria-hidden />}
                  subtitle="These become interview anchors"
                />
                {analysis.projects.length ? (
                  <ul className="space-y-4">
                    {analysis.projects.map((project) => (
                      <li key={project.name}>
                        <p className="text-sm font-medium text-ink-100">{project.name}</p>
                        {project.description ? <p className="mt-1 text-xs leading-relaxed text-ink-400">{project.description}</p> : null}
                        {project.technologies?.length ? (
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            {project.technologies.map((tech) => (
                              <span key={tech} className="chip">
                                {tech}
                              </span>
                            ))}
                          </div>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-ink-500">No projects detected in your résumé.</p>
                )}
              </Card>

              <Card>
                <SectionHeader title="Experience" icon={<BriefcaseBusiness className="h-4 w-4 text-neon" aria-hidden />} />
                {analysis.experience.length || analysis.internships.length ? (
                  <ul className="space-y-4">
                    {[...analysis.experience, ...analysis.internships].map((role, index) => (
                      <li key={`${role.company ?? 'role'}-${index}`}>
                        <p className="text-sm font-medium text-ink-100">
                          {role.role ?? 'Role'}
                          {role.company ? <span className="text-ink-400"> · {role.company}</span> : null}
                        </p>
                        {role.duration ? <p className="text-2xs text-ink-500">{role.duration}</p> : null}
                        {role.description ? <p className="mt-1 text-xs leading-relaxed text-ink-400">{role.description}</p> : null}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-ink-500">No work experience detected — that is fine for a student or fresher profile.</p>
                )}
              </Card>

              <Card className="lg:col-span-2">
                <SectionHeader title="Education, certifications & achievements" icon={<GraduationCap className="h-4 w-4 text-accent" aria-hidden />} />
                <div className="grid gap-5 sm:grid-cols-3">
                  <div>
                    <p className="section-title mb-2">Education</p>
                    {analysis.education.length ? (
                      <ul className="space-y-2 text-xs text-ink-300">
                        {analysis.education.map((entry, index) => (
                          <li key={`${entry.degree ?? 'degree'}-${index}`}>
                            <p className="font-medium text-ink-100">{entry.degree ?? 'Programme'}</p>
                            {entry.institution ? <p>{entry.institution}</p> : null}
                            {entry.year ? <p className="text-ink-500">{entry.year}</p> : null}
                            {entry.details ? <p className="text-ink-500">{entry.details}</p> : null}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-xs text-ink-500">Nothing detected.</p>
                    )}
                  </div>
                  <div>
                    <p className="section-title mb-2">Certifications</p>
                    {analysis.certifications.length ? (
                      <ul className="space-y-1.5 text-xs text-ink-300">
                        {analysis.certifications.map((item) => (
                          <li key={item} className="flex items-start gap-2">
                            <Award className="mt-0.5 h-3 w-3 shrink-0 text-warning" aria-hidden />
                            {item}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-xs text-ink-500">Nothing detected.</p>
                    )}
                  </div>
                  <div>
                    <p className="section-title mb-2">Achievements</p>
                    {analysis.achievements.length ? (
                      <ul className="space-y-1.5 text-xs text-ink-300">
                        {analysis.achievements.map((item) => (
                          <li key={item} className="flex items-start gap-2">
                            <BadgeCheck className="mt-0.5 h-3 w-3 shrink-0 text-success" aria-hidden />
                            {item}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-xs text-ink-500">Nothing detected.</p>
                    )}
                  </div>
                </div>
              </Card>
            </div>
          </>
        ) : (
          <EmptyState
            icon={<FileText className="h-5 w-5" aria-hidden />}
            title="Upload your résumé to personalize your interview."
            description="PDF, DOCX or TXT up to 10 MB. We extract your skills, projects, education and experience — then every interview question is grounded in your own work."
            action={
              <div className="flex flex-wrap justify-center gap-3">
                <FilePickerButton
                  accept={ACCEPTED}
                  maxSizeMb={10}
                  variant="primary"
                  disabled={uploading}
                  onSelect={(file) => void upload(file)}
                  onError={(message) => setError(message)}
                >
                  {uploading ? 'Uploading…' : 'Choose file'}
                </FilePickerButton>
                <Button variant="secondary" onClick={() => setPasteOpen(true)}>
                  Paste text instead
                </Button>
              </div>
            }
          />
        )}

        <FileUploader
          accept={ACCEPTED}
          maxSizeMb={10}
          uploading={uploading}
          progress={progress}
          uploadingLabel="Uploading and analysing your résumé…"
          uploadingHint="Extracting text, then reading your skills and projects."
          title={resume ? 'Replace your résumé — drag & drop here, or' : 'Drag & drop your résumé here, or'}
          actionLabel="browse files"
          hint="PDF · DOCX · TXT · max 10 MB · scanned image PDFs cannot be read"
          onSelect={(file) => void upload(file)}
          onError={(message) => setError(message)}
        />
      </div>

      <Modal
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title="Remove this résumé?"
        description="Interview questions will stop referencing it. Past reports stay available."
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmDelete(false)}>
              Keep résumé
            </Button>
            <Button variant="danger" onClick={() => void removeResume()}>
              Remove résumé
            </Button>
          </>
        }
      />

      <Modal
        open={pasteOpen}
        onClose={() => setPasteOpen(false)}
        title="Paste your résumé text"
        description="Useful if your résumé is a scanned PDF. Paste the text and we will analyse it the same way."
        footer={
          <>
            <Button variant="ghost" onClick={() => setPasteOpen(false)}>
              Cancel
            </Button>
            <Button
              loading={uploading}
              onClick={async () => {
                if (pasteText.trim().length < 200) {
                  toast.error('Add more text', 'Paste at least a few lines of your résumé.')
                  return
                }
                setUploading(true)
                try {
                  const response = await api.analyzeResumeText(pasteText.trim())
                  await load()
                  setPasteOpen(false)
                  setPasteText('')
                  toast.success('Résumé analysed', `${response.resume.parsed_data?.skills?.length ?? 0} skills extracted.`)
                } catch (caught) {
                  toast.error('Analysis failed', caught instanceof ApiError ? caught.message : 'Please try again.')
                } finally {
                  setUploading(false)
                }
              }}
            >
              Analyse text
            </Button>
          </>
        }
      >
        <textarea
          value={pasteText}
          onChange={(event) => setPasteText(event.target.value)}
          rows={10}
          className="input-base font-mono text-xs"
          placeholder={'ARJUN MEHTA\narjun@example.com | github.com/arjun\n\nSKILLS\nPython, SQL, React…'}
        />
      </Modal>
    </AppShell>
  )
}
