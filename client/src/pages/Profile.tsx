import { BadgeCheck, Briefcase, Camera, Mail, Save, ShieldCheck, UserRound } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { AppShell } from '../components/layout/AppShell'
import { Badge, Button, Card, ErrorState, Field, Input, LoadingState, SectionHeader, SegmentedControl } from '../components/ui/primitives'
import { ApiError, api, fileUrl } from '../lib/api'
import { EXPERIENCE_LEVELS, INTERVIEW_MODES } from '../lib/constants'
import { formatDate, initials } from '../lib/format'
import type { InterviewMode } from '../lib/types'
import { useAuth } from '../state/AuthContext'
import { useToast } from '../state/ToastContext'

export default function Profile() {
  const { profile, user, updateProfile, refresh } = useAuth()
  const toast = useToast()
  const avatarRef = useRef<HTMLInputElement | null>(null)

  const [form, setForm] = useState({
    full_name: '',
    target_role: '',
    company: '',
    experience_level: '',
    preferred_mode: 'text' as InterviewMode,
  })
  const [loading, setLoading] = useState(!profile)
  const [saving, setSaving] = useState(false)
  const [uploadingAvatar, setUploadingAvatar] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [overview, setOverview] = useState<{
    has_resume: boolean
    has_job: boolean
    resume_file: { file_name: string; created_at: string } | null
    job: { title: string; company: string | null; created_at: string } | null
  } | null>(null)

  useEffect(() => {
    if (profile) {
      setForm({
        full_name: profile.full_name ?? '',
        target_role: profile.target_role ?? '',
        company: profile.company ?? '',
        experience_level: profile.experience_level ?? 'Fresher',
        preferred_mode: (profile.preferred_mode as InterviewMode) ?? 'text',
      })
      setLoading(false)
    }
  }, [profile])

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        const response = await api.getProfile()
        if (cancelled) return
        setOverview({
          has_resume: response.has_resume,
          has_job: response.has_job,
          resume_file: response.resume_file,
          job: response.job,
        })
      } catch {
        /* profile overview is supplementary */
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [])

  const save = async (event: React.FormEvent) => {
    event.preventDefault()
    setError(null)
    if (form.full_name.trim().length < 2) {
      setError('Enter the name you want on your reports.')
      return
    }
    setSaving(true)
    try {
      await updateProfile({
        full_name: form.full_name.trim(),
        target_role: form.target_role.trim() || null,
        company: form.company.trim() || null,
        experience_level: form.experience_level as (typeof EXPERIENCE_LEVELS)[number],
        preferred_mode: form.preferred_mode,
      })
      toast.success('Profile updated', 'New interviews will use these preferences.')
    } catch (caught) {
      const message = caught instanceof ApiError ? caught.message : 'We could not save your profile.'
      setError(message)
      toast.error('Could not save', message)
    } finally {
      setSaving(false)
    }
  }

  const uploadAvatar = async (file: File) => {
    if (!file.type.startsWith('image/')) {
      toast.error('Unsupported file', 'Choose a PNG, JPG or WebP image.')
      return
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error('Image too large', 'Avatars must be smaller than 5 MB.')
      return
    }
    setUploadingAvatar(true)
    try {
      const response = await api.uploadAvatar(file)
      await refresh()
      toast.success('Avatar updated', response.avatar_url ? 'Your new avatar is live.' : 'Avatar saved.')
    } catch (caught) {
      toast.error('Upload failed', caught instanceof ApiError ? caught.message : 'Please try again.')
    } finally {
      setUploadingAvatar(false)
      if (avatarRef.current) avatarRef.current.value = ''
    }
  }

  const displayName = form.full_name || profile?.full_name || 'Your profile'
  const avatarSrc = profile?.avatar_url ? fileUrl(profile.avatar_url) : null

  return (
    <AppShell title="Profile" subtitle="How you appear on reports and how interviews are tuned">
      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <Card>
          <SectionHeader title="Personal details" icon={<UserRound className="h-4 w-4 text-accent" aria-hidden />} />

          {loading ? (
            <LoadingState label="Loading your profile…" rows={3} />
          ) : (
            <form className="space-y-5" onSubmit={save}>
              {error ? <ErrorState title="Could not save" message={error} /> : null}

              <div className="flex flex-wrap items-center gap-4">
                <span className="relative">
                  {avatarSrc ? (
                    <img
                      src={avatarSrc}
                      alt=""
                      className="h-16 w-16 rounded-3xl border border-white/10 object-cover"
                      onError={(event) => {
                        event.currentTarget.style.display = 'none'
                      }}
                    />
                  ) : (
                    <span className="flex h-16 w-16 items-center justify-center rounded-3xl bg-accent-sheen text-lg font-semibold text-white">
                      {initials(displayName) || 'VL'}
                    </span>
                  )}
                </span>
                <div>
                  <input
                    ref={avatarRef}
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    className="sr-only"
                    onChange={(event) => {
                      const file = event.target.files?.[0]
                      if (file) void uploadAvatar(file)
                    }}
                  />
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    loading={uploadingAvatar}
                    onClick={() => avatarRef.current?.click()}
                    icon={<Camera className="h-3.5 w-3.5" aria-hidden />}
                  >
                    Change avatar
                  </Button>
                  <p className="mt-2 text-2xs text-ink-500">PNG, JPG or WebP up to 5 MB. Stored in your own account folder.</p>
                </div>
              </div>

              <Field label="Full name" htmlFor="profile-name" required>
                <Input id="profile-name" value={form.full_name} onChange={(event) => setForm((current) => ({ ...current, full_name: event.target.value }))} autoComplete="name" />
              </Field>

              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Target role" htmlFor="profile-role" hint="Used as the default interview role">
                  <Input
                    id="profile-role"
                    value={form.target_role}
                    onChange={(event) => setForm((current) => ({ ...current, target_role: event.target.value }))}
                    placeholder="Machine Learning Engineer"
                  />
                </Field>
                <Field label="Target company" htmlFor="profile-company" hint="Optional">
                  <Input
                    id="profile-company"
                    value={form.company}
                    onChange={(event) => setForm((current) => ({ ...current, company: event.target.value }))}
                    placeholder="VozLook Studios"
                  />
                </Field>
              </div>

              <SegmentedControl
                label="Experience level"
                value={form.experience_level}
                onChange={(value) => setForm((current) => ({ ...current, experience_level: value }))}
                columns="grid-cols-1 sm:grid-cols-2"
                options={EXPERIENCE_LEVELS.map((level) => ({ value: level, label: level }))}
              />

              <SegmentedControl
                label="Preferred interview mode"
                value={form.preferred_mode}
                onChange={(value) => setForm((current) => ({ ...current, preferred_mode: value as InterviewMode }))}
                columns="grid-cols-1 sm:grid-cols-3"
                options={INTERVIEW_MODES.map((mode) => ({ value: mode.value, label: mode.label, description: mode.description }))}
              />

              <div className="flex flex-wrap items-center gap-3">
                <Button type="submit" loading={saving} icon={<Save className="h-4 w-4" aria-hidden />}>
                  Save changes
                </Button>
                <Link to="/settings" className="btn-ghost">
                  Account & security
                </Link>
              </div>
            </form>
          )}
        </Card>

        <div className="space-y-6">
          <Card>
            <SectionHeader title="Account" icon={<Mail className="h-4 w-4 text-neon" aria-hidden />} />
            <dl className="space-y-3 text-sm">
              <div className="flex items-center justify-between gap-3">
                <dt className="text-ink-500">Email</dt>
                <dd className="truncate text-ink-100">{user?.email}</dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-ink-500">Sign-in method</dt>
                <dd className="text-ink-100">{user?.provider === 'supabase' ? 'Supabase Auth' : 'Email & password'}</dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-ink-500">Member since</dt>
                <dd className="text-ink-100">{profile?.created_at ? formatDate(profile.created_at) : '—'}</dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-ink-500">Onboarding</dt>
                <dd>
                  {profile?.onboarding_completed ? (
                    <Badge tone="success">
                      <BadgeCheck className="h-3 w-3" aria-hidden /> Complete
                    </Badge>
                  ) : (
                    <Badge tone="warning">Incomplete</Badge>
                  )}
                </dd>
              </div>
            </dl>
            <Link to="/settings" className="btn-secondary mt-4 w-full !py-2 text-xs">
              Change password or delete account
            </Link>
          </Card>

          <Card>
            <SectionHeader title="Interview context" icon={<Briefcase className="h-4 w-4 text-accent" aria-hidden />} />
            <ul className="space-y-3 text-xs">
              <li className="flex items-start justify-between gap-3 rounded-2xl border border-white/[0.07] bg-white/[0.02] p-3">
                <span>
                  <span className="block font-medium text-ink-100">Résumé</span>
                  <span className="block text-ink-500">
                    {overview?.resume_file ? `${overview.resume_file.file_name} · ${formatDate(overview.resume_file.created_at)}` : 'Not uploaded yet'}
                  </span>
                </span>
                <Link to="/resume" className="btn-ghost !px-2.5 !py-1.5 text-2xs">
                  {overview?.has_resume ? 'Manage' : 'Upload'}
                </Link>
              </li>
              <li className="flex items-start justify-between gap-3 rounded-2xl border border-white/[0.07] bg-white/[0.02] p-3">
                <span>
                  <span className="block font-medium text-ink-100">Job description</span>
                  <span className="block text-ink-500">
                    {overview?.job ? `${overview.job.title}${overview.job.company ? ` · ${overview.job.company}` : ''}` : 'Not added yet'}
                  </span>
                </span>
                <Link to="/job" className="btn-ghost !px-2.5 !py-1.5 text-2xs">
                  {overview?.has_job ? 'Manage' : 'Add'}
                </Link>
              </li>
            </ul>
          </Card>

          <Card>
            <SectionHeader title="Privacy" icon={<ShieldCheck className="h-4 w-4 text-success" aria-hidden />} />
            <p className="text-xs leading-relaxed text-ink-400">
              Your résumé, job description, interviews and reports are tied to your account only. Server routes verify ownership on every request,
              and the same row-level policies are enforced in the Supabase migration when a Supabase project is connected.
            </p>
          </Card>
        </div>
      </div>
    </AppShell>
  )
}
