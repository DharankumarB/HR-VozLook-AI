import { AnimatePresence, motion } from 'framer-motion'
import { AlertCircle, Check, ChevronDown, Inbox, Loader2, X } from 'lucide-react'
import {
  forwardRef,
  Fragment,
  useEffect,
  useId,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react'
import { toneClasses, scoreTone } from '../../lib/format'

/* ------------------------------------------------------------------ */
/* Buttons                                                               */
/* ------------------------------------------------------------------ */

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger'

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: 'sm' | 'md' | 'lg'
  loading?: boolean
  icon?: ReactNode
  fullWidth?: boolean
}

const VARIANT_CLASS: Record<ButtonVariant, string> = {
  primary: 'btn-primary',
  secondary: 'btn-secondary',
  ghost: 'btn-ghost',
  danger: 'btn-danger',
}

const SIZE_CLASS = {
  sm: 'px-3 py-2 text-xs',
  md: 'px-4 py-2.5 text-sm',
  lg: 'px-5 py-3 text-sm sm:text-base',
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'md', loading, icon, fullWidth, className = '', children, disabled, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      className={`${VARIANT_CLASS[variant]} ${SIZE_CLASS[size]} ${fullWidth ? 'w-full' : ''} ${className}`}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : icon}
      {children}
    </button>
  )
})

export const IconButton = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement> & { label: string }>(
  function IconButton({ label, className = '', children, ...rest }, ref) {
    return (
      <button
        ref={ref}
        type="button"
        aria-label={label}
        title={label}
        className={`inline-flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] text-ink-200 transition-colors hover:border-white/25 hover:text-white disabled:opacity-50 ${className}`}
        {...rest}
      >
        {children}
      </button>
    )
  },
)

/* ------------------------------------------------------------------ */
/* Form fields                                                           */
/* ------------------------------------------------------------------ */

export function Field({
  label,
  hint,
  error,
  required,
  children,
  htmlFor,
}: {
  label: string
  hint?: string
  error?: string | null
  required?: boolean
  children: ReactNode
  htmlFor?: string
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between gap-3">
        <label htmlFor={htmlFor} className="text-sm font-medium text-ink-100">
          {label}
          {required ? <span className="ml-1 text-accent">*</span> : null}
        </label>
        {hint ? <span className="text-2xs text-ink-500">{hint}</span> : null}
      </div>
      {children}
      {error ? (
        <p className="flex items-center gap-1.5 text-xs text-danger" role="alert">
          <AlertCircle className="h-3.5 w-3.5" aria-hidden />
          {error}
        </p>
      ) : null}
    </div>
  )
}

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input(
  { className = '', ...rest },
  ref,
) {
  return <input ref={ref} className={`input-base ${className}`} {...rest} />
})

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea(
  { className = '', ...rest },
  ref,
) {
  return <textarea ref={ref} className={`input-base resize-y leading-relaxed ${className}`} {...rest} />
})

export const Select = forwardRef<
  HTMLSelectElement,
  SelectHTMLAttributes<HTMLSelectElement> & { options?: { value: string; label: string }[] }
>(function Select({ className = '', children, options, ...rest }, ref) {
  return (
    <div className="relative">
      <select ref={ref} className={`input-base appearance-none pr-10 ${className}`} {...rest}>
        {options?.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
        {children}
      </select>
      <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" aria-hidden />
    </div>
  )
})

/** Accessible segmented control used for difficulty / mode / count pickers. */
export function SegmentedControl<T extends string | number>({
  options,
  value,
  onChange,
  label,
  columns,
}: {
  options: { value: T; label: string; description?: string; icon?: ReactNode }[]
  value: T
  onChange: (value: T) => void
  label: string
  columns?: string
}) {
  const groupId = useId()
  return (
    <div role="radiogroup" aria-label={label} className={`grid gap-2 ${columns ?? 'grid-cols-2 sm:grid-cols-4'}`}>
      {options.map((option) => {
        const active = option.value === value
        return (
          <button
            key={String(option.value)}
            id={`${groupId}-${String(option.value)}`}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(option.value)}
            className={`rounded-2xl border p-3 text-left transition-all duration-200 ${
              active
                ? 'border-accent/70 bg-accent/10 shadow-[0_10px_36px_-20px_rgba(124,92,255,0.9)]'
                : 'border-white/10 bg-white/[0.03] hover:border-white/25 hover:bg-white/[0.06]'
            }`}
          >
            <span className="flex items-center gap-2 text-sm font-semibold text-ink-50">
              {option.icon}
              {option.label}
              {active ? <Check className="ml-auto h-4 w-4 text-accent" aria-hidden /> : null}
            </span>
            {option.description ? <span className="mt-1 block text-2xs leading-relaxed text-ink-400">{option.description}</span> : null}
          </button>
        )
      })}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Surfaces                                                              */
/* ------------------------------------------------------------------ */

export function Card({
  children,
  className = '',
  as: As = 'div',
}: {
  children: ReactNode
  className?: string
  as?: 'div' | 'section' | 'article' | 'li'
}) {
  return <As className={`glass-card p-5 sm:p-6 ${className}`}>{children}</As>
}

export function SectionHeader({
  title,
  subtitle,
  action,
  icon,
}: {
  title: string
  subtitle?: string
  action?: ReactNode
  icon?: ReactNode
}) {
  return (
    <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <h2 className="flex items-center gap-2 text-base font-semibold text-ink-50">
          {icon}
          {title}
        </h2>
        {subtitle ? <p className="mt-1 max-w-2xl text-sm text-ink-400">{subtitle}</p> : null}
      </div>
      {action}
    </div>
  )
}

export function Badge({
  children,
  tone = 'neutral',
  className = '',
}: {
  children: ReactNode
  tone?: 'neutral' | 'accent' | 'success' | 'warning' | 'danger' | 'neon'
  className?: string
}) {
  const tones = {
    neutral: 'border-white/10 bg-white/[0.05] text-ink-200',
    accent: 'border-accent/40 bg-accent/12 text-accent-soft',
    success: 'border-success/35 bg-success/10 text-success',
    warning: 'border-warning/35 bg-warning/10 text-warning',
    danger: 'border-danger/35 bg-danger/10 text-danger',
    neon: 'border-neon/35 bg-neon/10 text-neon-soft',
  }
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-2xs font-semibold ${tones[tone]} ${className}`}>
      {children}
    </span>
  )
}

export function ProgressBar({
  value,
  max = 100,
  label,
  tone,
  size = 'md',
  showValue = false,
}: {
  value: number
  max?: number
  label?: string
  tone?: 'strong' | 'fair' | 'weak' | 'none'
  size?: 'sm' | 'md'
  showValue?: boolean
}) {
  const percent = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0
  const resolvedTone = tone ?? scoreTone(percent)
  const colors = toneClasses[resolvedTone]
  return (
    <div className="w-full">
      {label || showValue ? (
        <div className="mb-1.5 flex items-center justify-between gap-3 text-xs">
          {label ? <span className="text-ink-300">{label}</span> : <span />}
          {showValue ? <span className={`font-semibold tabular-nums ${colors.text}`}>{Math.round(percent)}%</span> : null}
        </div>
      ) : null}
      <div
        className={`w-full overflow-hidden rounded-full bg-white/[0.07] ${size === 'sm' ? 'h-1.5' : 'h-2.5'}`}
        role="progressbar"
        aria-valuenow={Math.round(percent)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label ?? 'Progress'}
      >
        <motion.div
          className={`h-full rounded-full ${colors.bar}`}
          initial={{ width: 0 }}
          animate={{ width: `${percent}%` }}
          transition={{ duration: 0.6, ease: 'easeOut' }}
        />
      </div>
    </div>
  )
}

export function Stat({
  label,
  value,
  hint,
  icon,
  tone = 'none',
  loading,
}: {
  label: string
  value: ReactNode
  hint?: string
  icon?: ReactNode
  tone?: 'strong' | 'fair' | 'weak' | 'none'
  loading?: boolean
}) {
  const colors = toneClasses[tone]
  return (
    <div className="glass-card p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <p className="text-2xs font-semibold uppercase tracking-[0.16em] text-ink-400">{label}</p>
        {icon ? <span className={colors.text}>{icon}</span> : null}
      </div>
      {loading ? (
        <div className="mt-3 h-8 w-20 skeleton" />
      ) : (
        <p className={`mt-2 text-2xl font-semibold tabular-nums ${colors.text}`}>{value}</p>
      )}
      {hint ? <p className="mt-1 text-2xs text-ink-500">{hint}</p> : null}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* States                                                                */
/* ------------------------------------------------------------------ */

export function LoadingState({ label = 'Loading…', rows = 3 }: { label?: string; rows?: number }) {
  return (
    <div className="space-y-3" role="status" aria-live="polite" aria-label={label}>
      <div className="flex items-center gap-2 text-sm text-ink-300">
        <Loader2 className="h-4 w-4 animate-spin text-accent" aria-hidden />
        {label}
      </div>
      {Array.from({ length: rows }).map((_, index) => (
        <div key={index} className="h-16 skeleton" />
      ))}
    </div>
  )
}

export function EmptyState({
  title,
  description,
  action,
  icon,
}: {
  title: string
  description?: string
  action?: ReactNode
  icon?: ReactNode
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-3xl border border-dashed border-white/12 bg-white/[0.02] px-6 py-12 text-center">
      <span className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04] text-ink-300">
        {icon ?? <Inbox className="h-5 w-5" aria-hidden />}
      </span>
      <h3 className="text-base font-semibold text-ink-50">{title}</h3>
      {description ? <p className="mt-2 max-w-md text-sm leading-relaxed text-ink-400">{description}</p> : null}
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  )
}

export function ErrorState({
  title = 'Something went wrong',
  message,
  onRetry,
  retryLabel = 'Try again',
}: {
  title?: string
  message: string
  onRetry?: () => void
  retryLabel?: string
}) {
  return (
    <div className="rounded-3xl border border-danger/25 bg-danger/[0.06] p-5" role="alert">
      <div className="flex items-start gap-3">
        <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-danger" aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-ink-50">{title}</p>
          <p className="mt-1 text-sm leading-relaxed text-ink-300">{message}</p>
          {onRetry ? (
            <Button variant="secondary" size="sm" className="mt-4" onClick={onRetry}>
              {retryLabel}
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  )
}

export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = 'md',
}: {
  open: boolean
  onClose: () => void
  title: string
  description?: string
  children?: ReactNode
  footer?: ReactNode
  size?: 'sm' | 'md' | 'lg'
}) {
  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = previous
    }
  }, [open, onClose])

  const widths = { sm: 'max-w-sm', md: 'max-w-lg', lg: 'max-w-2xl' }

  return (
    <AnimatePresence>
      {open ? (
        <Fragment>
          <motion.div
            className="fixed inset-0 z-[90] bg-ink-950/80 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            aria-hidden
          />
          <div className="fixed inset-0 z-[95] flex items-end justify-center p-0 sm:items-center sm:p-6">
            <motion.div
              role="dialog"
              aria-modal="true"
              aria-label={title}
              className={`relative w-full ${widths[size]} max-h-[92vh] overflow-y-auto rounded-t-3xl border border-white/10 bg-surface p-5 shadow-card sm:rounded-3xl sm:p-6`}
              initial={{ opacity: 0, y: 24, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 12, scale: 0.99 }}
              transition={{ duration: 0.2 }}
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-lg font-semibold text-ink-50">{title}</h2>
                  {description ? <p className="mt-1 text-sm text-ink-400">{description}</p> : null}
                </div>
                <IconButton label="Close dialog" onClick={onClose}>
                  <X className="h-4 w-4" aria-hidden />
                </IconButton>
              </div>
              {children ? <div className="mt-5">{children}</div> : null}
              {footer ? <div className="mt-6 flex flex-wrap justify-end gap-2">{footer}</div> : null}
            </motion.div>
          </div>
        </Fragment>
      ) : null}
    </AnimatePresence>
  )
}

export function Spinner({ className = '' }: { className?: string }) {
  return <Loader2 className={`h-4 w-4 animate-spin ${className}`} aria-hidden />
}
