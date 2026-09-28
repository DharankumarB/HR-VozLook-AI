import { FileText, Upload } from 'lucide-react'
import { useRef, useState, type ReactNode } from 'react'
import { ProgressBar } from './primitives'

/**
 * Drag-and-drop + browse file picker with client-side validation and upload progress.
 *
 * The parent owns the upload itself (it knows the endpoint and the resulting state); this component
 * only handles selection, validation, keyboard access and the empty/uploading/progress visuals.
 */
export function FileUploader({
  accept,
  maxSizeMb = 10,
  onSelect,
  onError,
  uploading = false,
  progress = 0,
  uploadingLabel = 'Uploading…',
  uploadingHint,
  hint,
  title,
  actionLabel = 'browse files',
  icon,
  disabled = false,
}: {
  accept: string
  maxSizeMb?: number
  onSelect: (file: File) => void
  onError?: (message: string) => void
  uploading?: boolean
  progress?: number
  uploadingLabel?: string
  uploadingHint?: string
  hint?: string
  title?: string
  actionLabel?: string
  icon?: ReactNode
  disabled?: boolean
}) {
  const inputRef = useRef<HTMLInputElement | null>(null)
  const [dragging, setDragging] = useState(false)

  const extensions = accept
    .split(',')
    .map((value) => value.trim().replace('.', '').toLowerCase())
    .filter(Boolean)

  const handle = (file: File | undefined | null) => {
    if (!file) return
    const extension = file.name.split('.').pop()?.toLowerCase() ?? ''
    if (extensions.length && !extensions.includes(extension)) {
      onError?.(`Upload a ${extensions.map((value) => value.toUpperCase()).join(' / ')} file.`)
      return
    }
    if (file.size === 0) {
      onError?.('That file is empty. Choose another file.')
      return
    }
    if (file.size > maxSizeMb * 1024 * 1024) {
      onError?.(`Files must be smaller than ${maxSizeMb} MB.`)
      return
    }
    onSelect(file)
  }

  return (
    <div
      onDragOver={(event) => {
        event.preventDefault()
        if (!disabled) setDragging(true)
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(event) => {
        event.preventDefault()
        setDragging(false)
        if (disabled) return
        handle(event.dataTransfer.files?.[0])
      }}
      className={`rounded-3xl border-2 border-dashed p-6 text-center transition-colors ${
        dragging ? 'border-accent/60 bg-accent/[0.06]' : 'border-white/10 bg-white/[0.015]'
      }`}
    >
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="sr-only"
        disabled={disabled}
        onChange={(event) => {
          handle(event.target.files?.[0])
          if (inputRef.current) inputRef.current.value = ''
        }}
      />

      {uploading ? (
        <div className="mx-auto max-w-sm space-y-3">
          <p className="text-sm font-medium text-ink-100">{uploadingLabel}</p>
          <ProgressBar value={progress} showValue />
          {uploadingHint ? <p className="text-2xs text-ink-500">{uploadingHint}</p> : null}
        </div>
      ) : (
        <div className="space-y-2">
          <span className="mx-auto flex h-11 w-11 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04] text-accent-soft">
            {icon ?? <FileText className="h-5 w-5" aria-hidden />}
          </span>
          <p className="text-sm text-ink-200">
            {title ?? 'Drag & drop your file here, or'}{' '}
            <button
              type="button"
              disabled={disabled}
              className="font-semibold text-accent-soft hover:underline disabled:opacity-50"
              onClick={() => inputRef.current?.click()}
            >
              {actionLabel}
            </button>
          </p>
          <p className="text-2xs text-ink-500">{hint ?? `Max ${maxSizeMb} MB`}</p>
        </div>
      )}
    </div>
  )
}

/** Compact variant used inside forms: a styled button that opens the picker directly. */
export function FilePickerButton({
  accept,
  onSelect,
  onError,
  maxSizeMb = 10,
  children,
  disabled = false,
  variant = 'secondary',
  fullWidth = false,
}: {
  accept: string
  onSelect: (file: File) => void
  onError?: (message: string) => void
  maxSizeMb?: number
  children: ReactNode
  disabled?: boolean
  variant?: 'primary' | 'secondary'
  fullWidth?: boolean
}) {
  const inputRef = useRef<HTMLInputElement | null>(null)
  const extensions = accept
    .split(',')
    .map((value) => value.trim().replace('.', '').toLowerCase())
    .filter(Boolean)

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="sr-only"
        disabled={disabled}
        onChange={(event) => {
          const file = event.target.files?.[0]
          if (inputRef.current) inputRef.current.value = ''
          if (!file) return
          const extension = file.name.split('.').pop()?.toLowerCase() ?? ''
          if (extensions.length && !extensions.includes(extension)) {
            onError?.(`Upload a ${extensions.map((value) => value.toUpperCase()).join(' / ')} file.`)
            return
          }
          if (file.size > maxSizeMb * 1024 * 1024) {
            onError?.(`Files must be smaller than ${maxSizeMb} MB.`)
            return
          }
          onSelect(file)
        }}
      />
      <button
        type="button"
        disabled={disabled}
        className={`${variant === 'primary' ? 'btn-primary' : 'btn-secondary'} ${fullWidth ? 'w-full' : ''}`}
        onClick={() => inputRef.current?.click()}
      >
        <Upload className="h-3.5 w-3.5" aria-hidden />
        {children}
      </button>
    </>
  )
}
