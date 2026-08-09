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
  /** Set only where equal-width buttons are wanted; otherwise chips size to their text. */
  columns?: 1 | 2 | 4
  placeholder?: string
  /** The rest of the choices, revealed by the escape hatch along with the text field. */
  moreOptions?: string[]
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
  moreOptions = [],
}: OptionGridProps) {
  const [expanded, setExpanded] = useState(false)
  const known = options.includes(value) || moreOptions.includes(value)
  const isTyped = value !== '' && !known
  /*
   * What the text field holds, kept apart from the chosen value.
   *
   * Opening "Altro…" must not drop the current selection — someone may only be looking
   * for a choice further down the list — but it must not pre-fill the box with it
   * either, or the first thing typed lands on the end of the old value.
   */
  const [custom, setCustom] = useState(() => (isTyped ? value : ''))
  const showCustom = expanded || isTyped
  const gridClass = columns ? `options cols-${columns}` : 'options'

  const choice = (option: string) => (
    <button
      key={option}
      type="button"
      className={`option${value === option ? ' is-selected' : ''}`}
      onClick={() => {
        setExpanded(false)
        setCustom('')
        onChange(option)
      }}
    >
      {option}
    </button>
  )

  return (
    <div className="stack">
      <div className={gridClass}>
        {options.map(choice)}
        {otherLabel && (moreOptions.length > 0 || !expanded) ? (
          <button
            type="button"
            className={`option is-other${expanded ? ' is-selected' : ''}`}
            onClick={() => setExpanded(!expanded)}
          >
            {otherLabel}
          </button>
        ) : null}
      </div>

      {/* The rest of the choices, plus somewhere to type one that is not listed. */}
      {expanded && moreOptions.length > 0 ? (
        <div className={gridClass}>{moreOptions.map(choice)}</div>
      ) : null}
      {showCustom ? (
        <input
          className="input"
          value={custom}
          placeholder={placeholder}
          onChange={(e) => {
            setCustom(e.target.value)
            onChange(e.target.value)
          }}
          autoFocus={expanded}
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
  steady = false,
}: {
  title: string
  /** Context that must stay visible while the body scrolls — typically which day. */
  subtitle?: string
  onClose: () => void
  children: ReactNode
  footer?: ReactNode
  /**
   * Hold one height regardless of what is inside.
   *
   * A sheet grows from the bottom edge, so a sheet whose contents can be swapped in
   * place — days, in the calendar — jumps up and down as you move between a full day and
   * an empty one. Anything the reader navigates *within* wants a steady frame.
   */
  steady?: boolean
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
      <div
        className={`sheet${steady ? ' is-steady' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
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
