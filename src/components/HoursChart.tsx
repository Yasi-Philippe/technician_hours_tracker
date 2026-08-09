/**
 * Hours over time, as stacked columns.
 *
 * The form is **emphasis**, not two independent series: overtime is the part that
 * matters and normal hours are the context it sits in. So it is one accent (the brand
 * red, used nowhere else in a chart) against a de-emphasis grey, rather than two
 * competing hues.
 *
 * That pairing was validated rather than eyeballed: CVD separation ΔE 8.3 (protan),
 * normal-vision ΔE 27.4, both segments above 3:1 against the surface. Identity never
 * rests on colour alone either — a legend is always present, the tallest column is
 * directly labelled, and a 2px surface gap separates the segments.
 */

import { useState } from 'react'

export interface ChartPoint {
  key: string
  /** Axis label. Empty to leave the tick unlabelled on a crowded axis. */
  label: string
  /** Full label used in the readout, where there is room for it. */
  fullLabel: string
  normalMinutes: number
  extraMinutes: number
}

const WIDTH = 340
const HEIGHT = 190
const PAD_TOP = 24
const PAD_BOTTOM = 26
const MAX_BAR = 24
const GAP = 2
const RADIUS = 4

/** A column with rounded top corners and a square foot on the baseline. */
function columnPath(x: number, y: number, w: number, h: number, rounded: boolean): string {
  const r = rounded ? Math.min(RADIUS, w / 2, h) : 0
  if (h <= 0) return ''
  return [
    `M${x},${y + h}`,
    `L${x},${y + r}`,
    r ? `Q${x},${y} ${x + r},${y}` : `L${x},${y}`,
    `L${x + w - r},${y}`,
    r ? `Q${x + w},${y} ${x + w},${y + r}` : `L${x + w},${y}`,
    `L${x + w},${y + h}`,
    'Z',
  ].join(' ')
}

function formatHours(minutes: number): string {
  const hours = minutes / 60
  return Number.isInteger(hours) ? `${hours}h` : `${hours.toFixed(1)}h`
}

export function HoursChart({
  points,
  normalLabel,
  extraLabel,
  emptyLabel,
}: {
  points: ChartPoint[]
  normalLabel: string
  extraLabel: string
  emptyLabel: string
}) {
  const [active, setActive] = useState<string | null>(null)

  const totals = points.map((p) => p.normalMinutes + p.extraMinutes)
  const peak = Math.max(...totals, 0)
  if (peak === 0) return <p className="hint">{emptyLabel}</p>

  // Round the scale up to a whole hour so the axis means something.
  const scaleMax = Math.max(Math.ceil(peak / 60) * 60, 60)
  const plotHeight = HEIGHT - PAD_TOP - PAD_BOTTOM
  const baseline = HEIGHT - PAD_BOTTOM
  const band = WIDTH / points.length
  const barWidth = Math.min(MAX_BAR, Math.max(4, band * 0.62))
  const scale = (minutes: number) => (minutes / scaleMax) * plotHeight

  const peakIndex = totals.indexOf(peak)
  const shown = points.find((p) => p.key === active) ?? null

  return (
    <div className="chart-block">
      {/*
        The readout doubles as the tooltip: on a phone a floating bubble is worse than a
        fixed line that is always in the same place.

        Both lines are always rendered — filled with a non-breaking space when nothing is
        hovered — so the block has exactly one height and the chart below it cannot move.
        Reserving space with a min-height did not hold: the real content is taller than
        the reservation, so everything shifted down the moment a bar was touched.
      */}
      <div className="chart-readout" role="status">
        <span className="chart-readout-label">{shown ? shown.fullLabel : '\u00A0'}</span>
        <span className="chart-readout-value">
          {shown ? (
            <>
              {formatHours(shown.normalMinutes + shown.extraMinutes)}
              {shown.extraMinutes > 0 ? (
                <span className="chart-readout-extra">
                  {' · '}
                  {formatHours(shown.extraMinutes)} {extraLabel}
                </span>
              ) : null}
            </>
          ) : (
            '\u00A0'
          )}
        </span>
      </div>

      <svg
        className="chart"
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        preserveAspectRatio="xMidYMid meet"
        role="img"
      >
        {/* Recessive gridlines: hairline, solid, one step off the surface. */}
        {[0, 0.5, 1].map((fraction) => {
          const y = baseline - plotHeight * fraction
          return (
            <g key={fraction}>
              <line className="chart-grid" x1="0" y1={y} x2={WIDTH} y2={y} />
              <text className="chart-axis" x="0" y={y - 4}>
                {fraction === 0 ? '' : formatHours(scaleMax * fraction)}
              </text>
            </g>
          )
        })}

        {points.map((point, index) => {
          const total = point.normalMinutes + point.extraMinutes
          const x = index * band + (band - barWidth) / 2
          const extraH = scale(point.extraMinutes)
          const normalH = scale(point.normalMinutes)
          const hasExtra = point.extraMinutes > 0
          // The 2px gap is what separates the segments — never a stroke.
          const normalY = baseline - normalH
          const extraY = normalY - GAP - extraH

          return (
            <g
              key={point.key}
              onPointerEnter={() => setActive(point.key)}
              onPointerLeave={() => setActive(null)}
              onClick={() => setActive(active === point.key ? null : point.key)}
            >
              {/* Hit target larger than the mark. */}
              <rect
                x={index * band}
                y={PAD_TOP}
                width={band}
                height={plotHeight}
                fill="transparent"
              />
              {total > 0 ? (
                <>
                  <path
                    className="chart-normal"
                    d={columnPath(x, normalY, barWidth, normalH, !hasExtra)}
                  />
                  {hasExtra ? (
                    <path
                      className="chart-extra"
                      d={columnPath(x, extraY, barWidth, extraH, true)}
                    />
                  ) : null}
                </>
              ) : null}

              {/* Label the peak only. A number on every column goes unread. */}
              {index === peakIndex && total > 0 ? (
                <text
                  className="chart-peak"
                  x={x + barWidth / 2}
                  y={(hasExtra ? extraY : normalY) - 7}
                  textAnchor="middle"
                >
                  {formatHours(total)}
                </text>
              ) : null}

              {point.label ? (
                <text
                  className={`chart-tick${active === point.key ? ' is-active' : ''}`}
                  x={x + barWidth / 2}
                  y={HEIGHT - 9}
                  textAnchor="middle"
                >
                  {point.label}
                </text>
              ) : null}
            </g>
          )
        })}

        <line className="chart-baseline" x1="0" y1={baseline} x2={WIDTH} y2={baseline} />
      </svg>

      <div className="legend">
        <span className="legend-key">
          <span className="legend-swatch" />
          {normalLabel}
        </span>
        <span className="legend-key">
          <span className="legend-swatch ot" />
          {extraLabel}
        </span>
      </div>
    </div>
  )
}
