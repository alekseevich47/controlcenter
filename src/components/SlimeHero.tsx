export function SlimeHero() {
  return (
    <div className="slime-stage" aria-hidden>
      <svg width="0" height="0">
        <defs>
          <filter id="slime-goo">
            <feGaussianBlur in="SourceGraphic" stdDeviation="10" result="blur" />
            <feColorMatrix
              in="blur"
              mode="matrix"
              values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 22 -10"
              result="goo"
            />
            <feBlend in="SourceGraphic" in2="goo" />
          </filter>
        </defs>
      </svg>
      <div className="slime-blob">
        <div className="slime-core" />
        <div className="slime-sat" />
        <div className="slime-sat b" />
      </div>
    </div>
  )
}
