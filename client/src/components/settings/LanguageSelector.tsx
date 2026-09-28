import { Languages } from 'lucide-react'
import { useState } from 'react'
import { Badge, Card, SectionHeader, Select } from '../ui/primitives'
import { LANGUAGES } from '../../lib/constants'
import { ApiError } from '../../lib/api'
import { useAuth } from '../../state/AuthContext'
import { useToast } from '../../state/ToastContext'
import type { LanguageCode } from '../../lib/types'

/**
 * Interview language selector.
 *
 * English is the only language enabled today. Everything else is listed as "coming soon" so the
 * roadmap is visible, but the values cannot be selected — the server refuses a language that is not
 * enabled, which guarantees a session never mixes languages.
 */
export function LanguageSelector({ compact = false }: { compact?: boolean }) {
  const { profile, setLanguage } = useAuth()
  const toast = useToast()
  const [saving, setSaving] = useState(false)
  const current = (profile?.preferred_language ?? 'en') as LanguageCode

  const onChange = async (code: string) => {
    setSaving(true)
    try {
      await setLanguage(code as LanguageCode)
      toast.success('Language updated', `Questions, feedback and reports will now be written in ${LANGUAGES.find((l) => l.code === code)?.label ?? 'English'}.`)
    } catch (caught) {
      toast.error('Could not change the language', caught instanceof ApiError ? caught.message : 'Please try again.')
    } finally {
      setSaving(false)
    }
  }

  const control = (
    <div className="flex flex-wrap items-center gap-3">
      <Select value={current} onChange={(event) => void onChange(event.target.value)} disabled={saving} aria-label="Interview language" className="max-w-xs">
        {LANGUAGES.map((language) => (
          <option key={language.code} value={language.code} disabled={!language.enabled}>
            {language.label}
            {language.native !== language.label ? ` · ${language.native}` : ''}
            {language.enabled ? '' : ' (coming soon)'}
          </option>
        ))}
      </Select>
      <Badge tone={saving ? 'warning' : 'success'}>{saving ? 'Saving…' : 'English active'}</Badge>
    </div>
  )

  if (compact) return control

  return (
    <Card>
      <SectionHeader
        title="Interview language"
        subtitle="Questions, feedback, reports and the interviewer's voice all follow this setting."
        icon={<Languages className="h-4 w-4 text-accent-soft" aria-hidden />}
      />
      {control}
      <p className="mt-3 text-2xs leading-relaxed text-ink-500">
        VozHireQ ships English only today. The platform is built to add more languages without changing how interviews work: each session stores the
        language it was created in, and the AI is instructed to answer in exactly one language so output is never mixed. Additional languages appear
        here automatically once the server enables them.
      </p>
    </Card>
  )
}
