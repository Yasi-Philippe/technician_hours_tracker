/**
 * The app mark.
 *
 * A dial: the ring is the working day, the red arc at the top is overtime, and the
 * needle rests where one becomes the other. It is the same thing the app measures, drawn
 * once — which is why the red here means what red means everywhere else in the app.
 *
 * Geometry matches `public/favicon.svg` exactly; both come from the same fractions.
 */
export function Logo({ size = 48 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      role="img"
      aria-label="Ore"
      style={{ display: 'block' }}
    >
      <rect width="64" height="64" rx="14.40" fill="#0a0a0b" />
      <circle cx="32" cy="32" r="19.20" fill="none" stroke="#ffffff" strokeWidth="5.76" />
      <path
        d="M25.43,13.96 A19.20,19.20 0 0 1 44.34,17.29"
        fill="none"
        stroke="#ce0e2d"
        strokeWidth="5.76"
        strokeLinecap="round"
      />
      <line
        x1="32"
        y1="32"
        x2="36.25"
        y2="18.91"
        stroke="#ffffff"
        strokeWidth="4.10"
        strokeLinecap="round"
      />
      <circle cx="32" cy="32" r="2.69" fill="#ce0e2d" />
    </svg>
  )
}
