/**
 * The shared interface kit.
 *
 * Controls here are deliberately larger and blunter than a typical mobile app. The people
 * using this are outdoors, often wearing gloves, and several of them are not comfortable
 * with phones — so a control that is obvious and hard to miss beats one that is elegant.
 */

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { formatClock, formatDuration, parseClock, stepClock } from '../lib/time'

// ---------------------------------------------------------------- primitives

export function Field({
  label,
  children,
  hint,
}: {
  label: string
  children: ReactNode
  hint?: string
}) {
  return (
    <div className="field">
      <span className="field-label">{label}</span>
      {children}
      {hint ? <p className="hint">{hint}</p> : null}
    </div>
  )
}

export function Card({
  title,
  action,
  children,
}: {
  title?: string
  action?: ReactNode
  children: ReactNode
}) {
  return (
    <div className="card">
      {title ? (
        <div className="card-head">
          <h2 className="card-title">{title}</h2>
          {action}
        </div>
      ) : null}
      <div className="card-body">{children}</div>
    </div>
  )
}

export function Empty({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="empty">
      <p className="empty-title">{title}</p>
      {hint ? <p className="empty-hint">{hint}</p> : null}
    </div>
  )
}

export function Credit({ text }: { text: string }) {
  return <p className="credit">{text}</p>
}

/**
 * Hours worked, with the overtime named rather than appended.
 *
 * "9h +1h" reads as a sum — as though ten hours were worked — when the overtime is
 * already inside the total. "9h (1h extra)" says the same thing without the arithmetic
 * trap, which matters on a screen someone checks against their payslip.
 */
export function HoursSummary({
  totalMinutes,
  extraMinutes,
  extraLabel,
}: {
  totalMinutes: number
  extraMinutes: number
  extraLabel: string
}) {
  return (
    <>
      {formatDuration(totalMinutes)}
      {extraMinutes > 0 ? (
        <span className="ot">
          {' '}
          ({formatDuration(extraMinutes)} {extraLabel})
        </span>
      ) : null}
    </>
  )
}

// -------------------------------------------------------------------- switch

export function Switch({
  label,
  checked,
  onChange,
}: {
  label: string
  checked: boolean
  onChange: (next: boolean) => void
}) {
  return (
    <button
      type="button"
      className="switch"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
    >
      <span className="row-label">{label}</span>
      <span className={`switch-track${checked ? ' is-on' : ''}`}>
        <span className="switch-knob" />
      </span>
    </button>
  )
}

// --------------------------------------------------------------- option grid

export interface OptionGridProps {
  options: string[]
  value: string
  onChange: (next: string) => void
  /** Label for the escape hatch that lets someone type a value not on the list. */
  otherLabel?: string
  /** Omit to let the grid size itself from the length of the labels. */
  columns?: 1 | 2 | 4
  placeholder?: string
  /** True for values the technician typed themselves, which they may remove. */
  removable?: (value: string) => boolean
  onRemove?: (value: string) => void
  /** Labels for the remove affordance, so this stays free of interface text. */
  moreLabel?: string
  removeLabel?: string
  cancelLabel?: string
}

/**
 * How many options fit across, judged by the longest label.
 *
 * Short codes like "PB07" waste most of a full-width row and turn a list of thirteen
 * into a long scroll; a wordy label like "Conservazione parco" needs the whole width to
 * stay readable. Deciding from the content means a pack can change its lists without
 * anyone revisiting this.
 */
function autoColumns(options: string[]): 1 | 2 | 4 {
  const longest = options.reduce((max, option) => Math.max(max, option.trim().length), 0)
  if (longest <= 6) return 4
  if (longest <= 14) return 2
  return 1
}

/**
 * Large tappable choices, ordered so the most likely option is first.
 *
 * A value that is not on the list still shows as selected rather than disappearing —
 * important when a pack is updated and an older entry references a retired project.
 */
export function OptionGrid({
  options,
  value,
  onChange,
  otherLabel,
  columns,
  placeholder,
  removable,
  onRemove,
  moreLabel = '',
  removeLabel = '',
  cancelLabel = '',
}: OptionGridProps) {
  const [typing, setTyping] = useState(false)
  const [confirming, setConfirming] = useState<string | null>(null)
  const known = options.includes(value)
  const showCustom = typing || (value !== '' && !known)
  const across = columns ?? autoColumns(options)

  return (
    <div className="stack">
      <div className={`options cols-${across}`}>
        {options.map((option) => {
          const canRemove = removable?.(option) === true && onRemove !== undefined
          const button = (
            <button
              type="button"
              className={`option${value === option && !typing ? ' is-selected' : ''}`}
              onClick={() => {
                setTyping(false)
                setConfirming(null)
                onChange(option)
              }}
            >
              {option}
            </button>
          )
          // A value the technician typed carries its own way out. A button inside a
          // button is not valid, so the pair share a wrapper instead.
          return canRemove ? (
            <span className="option-wrap" key={option}>
              {button}
              <button
                type="button"
                className="option-more"
                aria-label={`${moreLabel}: ${option}`}
                onClick={() => setConfirming(confirming === option ? null : option)}
              >
                ⋯
              </button>
            </span>
          ) : (
            <span className="option-wrap" key={option}>
              {button}
            </span>
          )
        })}
        {otherLabel ? (
          <button
            type="button"
            className={`option is-other${showCustom ? ' is-selected' : ''}`}
            onClick={() => {
              setTyping(true)
              if (known) onChange('')
            }}
          >
            {otherLabel}
          </button>
        ) : null}
      </div>
      {confirming !== null ? (
        <RemoveConfirm
          value={confirming}
          removeLabel={removeLabel}
          cancelLabel={cancelLabel}
          onRemove={() => {
            onRemove?.(confirming)
            setConfirming(null)
          }}
          onCancel={() => setConfirming(null)}
        />
      ) : null}

      {showCustom ? (
        <input
          className="input"
          value={value}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
          autoFocus={typing}
        />
      ) : null}
    </div>
  )
}

/**
 * Confirming a removal, inline and in words.
 *
 * A floating menu is fiddly to hit and easy to dismiss by accident; a strip that names
 * the value and offers two large buttons cannot be misread. Removing only forgets the
 * value for next time — reports that already use it keep their own copy.
 */
export function RemoveConfirm({
  value,
  removeLabel,
  cancelLabel,
  onRemove,
  onCancel,
}: {
  value: string
  removeLabel: string
  cancelLabel: string
  onRemove: () => void
  onCancel: () => void
}) {
  return (
    <div className="remove-confirm">
      <span className="remove-confirm-value">{value}</span>
      <div className="btn-row">
        <button type="button" className="btn btn-danger" onClick={onRemove}>
          {removeLabel}
        </button>
        <button type="button" className="btn btn-ghost" onClick={onCancel}>
          {cancelLabel}
        </button>
      </div>
    </div>
  )
}

// ----------------------------------------------------------------- time box

/**
 * A clock the technician can drive without ever opening a keyboard.
 *
 * The steppers snap to the quarter hour, which is how these shifts are actually recorded.
 * Typing still works for the odd 07:23, and accepts "723" and "7.23" as well as "07:23".
 */
export function TimeBox({
  label,
  minutes,
  onChange,
  step = 15,
}: {
  label: string
  minutes: number
  onChange: (next: number) => void
  step?: number
}) {
  const [draft, setDraft] = useState<string | null>(null)
  const id = useId()

  const commit = () => {
    if (draft === null) return
    const parsed = parseClock(draft)
    if (parsed !== null) onChange(parsed)
    setDraft(null)
  }

  return (
    <div className="timebox">
      <label className="timebox-label" htmlFor={id}>
        {label}
      </label>
      <input
        id={id}
        className="timebox-value"
        inputMode="numeric"
        value={draft ?? formatClock(minutes)}
        onChange={(e) => setDraft(e.target.value)}
        onFocus={(e) => {
          setDraft(formatClock(minutes))
          requestAnimationFrame(() => e.target.select())
        }}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur()
        }}
      />
      <div className="timebox-steps">
        <button
          type="button"
          className="timebox-step"
          aria-label={`${label} −${step}`}
          onClick={() => onChange(stepClock(minutes, -step))}
        >
          −
        </button>
        <button
          type="button"
          className="timebox-step"
          aria-label={`${label} +${step}`}
          onClick={() => onChange(stepClock(minutes, step))}
        >
          +
        </button>
      </div>
    </div>
  )
}

// -------------------------------------------------------------------- sheet

/**
 * How many sheets are currently open.
 *
 * Sheets stack — a day opens over the calendar, and its entry form opens over that.
 * Without knowing the depth, one Escape would close every open sheet at once instead of
 * stepping back one level.
 */
let openSheets = 0

/**
 * A bottom sheet. Closing is always available and never asks for confirmation —
 * destructive steps are undoable instead.
 */
export function Sheet({
  title,
  subtitle,
  onClose,
  children,
  footer,
}: {
  title: string
  /** Context that must stay visible while the body scrolls — typically which day. */
  subtitle?: string
  onClose: () => void
  children: ReactNode
  footer?: ReactNode
}) {
  const bodyRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const depth = ++openSheets
    const onKey = (e: KeyboardEvent) => {
      // Only the sheet on top responds, so Escape steps back one level.
      if (e.key === 'Escape' && depth === openSheets) onClose()
    }
    document.addEventListener('keydown', onKey)
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      openSheets--
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = previous
    }
  }, [onClose])

  return (
    <>
      <div className="sheet-scrim" onClick={onClose} />
      <div className="sheet" role="dialog" aria-modal="true" aria-label={title}>
        <div className="sheet-head">
          <div>
            <h2 className="sheet-title">{title}</h2>
            {subtitle ? <p className="sheet-subtitle">{subtitle}</p> : null}
          </div>
          <button type="button" className="sheet-close" onClick={onClose} aria-label="×">
            ✕
          </button>
        </div>
        <div className="sheet-body" ref={bodyRef}>
          {children}
        </div>
        {footer ? <div className="sheet-foot">{footer}</div> : null}
      </div>
    </>
  )
}

// -------------------------------------------------------------------- toast

export interface ToastState {
  message: string
  tone?: 'ok' | 'dark'
  action?: { label: string; run: () => void }
}

export function Toast({ toast, onDismiss }: { toast: ToastState; onDismiss: () => void }) {
  useEffect(() => {
    const timer = setTimeout(onDismiss, toast.action ? 6000 : 2600)
    return () => clearTimeout(timer)
  }, [toast, onDismiss])

  return (
    <div className={`toast${toast.tone === 'ok' ? ' is-ok' : ''}`} role="status">
      <span>{toast.message}</span>
      {toast.action ? (
        <button
          type="button"
          className="toast-action"
          onClick={() => {
            toast.action?.run()
            onDismiss()
          }}
        >
          {toast.action.label}
        </button>
      ) : null}
    </div>
  )
}

export function useToast() {
  const [toast, setToast] = useState<ToastState | null>(null)
  const show = useCallback((next: ToastState) => setToast(next), [])
  const dismiss = useCallback(() => setToast(null), [])
  return { toast, show, dismiss }
}

// -------------------------------------------------------------------- icons

export function Icon({ name }: { name: 'day' | 'week' | 'stats' | 'settings' }) {
  const common = {
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.8,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
  }
  switch (name) {
    case 'day':
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="8" />
          <path d="M12 8v4l2.5 2" />
        </svg>
      )
    case 'week':
      return (
        <svg {...common}>
          <rect x="3" y="5" width="18" height="16" rx="2" />
          <path d="M3 10h18M8 3v4M16 3v4" />
        </svg>
      )
    case 'stats':
      return (
        <svg {...common}>
          <path d="M5 20V11M12 20V5M19 20v-6" />
        </svg>
      )
    case 'settings':
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="3" />
          <path d="M12 3v2m0 14v2M3 12h2m14 0h2M5.6 5.6l1.4 1.4m10 10 1.4 1.4m0-12.8-1.4 1.4m-10 10L5.6 18.4" />
        </svg>
      )
  }
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  // Revoked on the next tick so the download has certainly started.
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}
