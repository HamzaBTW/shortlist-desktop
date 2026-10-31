import { useTranslation } from 'react-i18next'

interface FitRingProps {
  score: number
  size?: 'lg' | 'sm'
}

/** Design system FitRing: accent arc on a line track, quiet (ink-muted) below 50. */
export function FitRing({ score, size = 'lg' }: FitRingProps) {
  const { t } = useTranslation()
  const px = size === 'lg' ? 64 : 40
  const stroke = size === 'lg' ? 6 : 4
  const r = (px - stroke) / 2
  const c = 2 * Math.PI * r
  const value = Math.max(0, Math.min(100, score))

  return (
    <span
      className={`sl-ring${size === 'sm' ? ' sl-ring--sm' : ''}${value < 50 ? ' sl-ring--low' : ''}`}
      role="img"
      aria-label={t('fit.ringLabel', { score: value })}
    >
      <svg width={px} height={px} aria-hidden="true">
        <circle className="sl-ring__track" cx={px / 2} cy={px / 2} r={r} strokeWidth={stroke} />
        <circle
          className="sl-ring__arc"
          cx={px / 2}
          cy={px / 2}
          r={r}
          strokeWidth={stroke}
          strokeDasharray={`${(value / 100) * c} ${c}`}
        />
      </svg>
      <span className="sl-ring__val" aria-hidden="true">
        {value}
      </span>
    </span>
  )
}
