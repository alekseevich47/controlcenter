export function LogoMark({ size = 42 }: { size?: number }) {
  return (
    <svg
      className="brand-mark"
      width={size}
      height={size}
      viewBox="0 0 120 120"
      aria-hidden
    >
      <defs>
        <filter id="logo-glow" x="-40%" y="-40%" width="180%" height="180%">
          <feGaussianBlur stdDeviation="4" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      <path
        filter="url(#logo-glow)"
        fill="#c6f53d"
        d="M62 8c22 2 42 18 46 38 4 22-8 44-28 52-18 8-42 4-54-12-14-18-12-46 4-60C40 14 50 7 62 8Z"
      >
        <animate
          attributeName="d"
          dur="5s"
          repeatCount="indefinite"
          values="
            M62 8c22 2 42 18 46 38 4 22-8 44-28 52-18 8-42 4-54-12-14-18-12-46 4-60C40 14 50 7 62 8Z;
            M58 10c26 0 44 20 46 40 2 24-12 42-32 48-20 6-40 2-50-16-12-20-8-46 8-58C44 14 48 10 58 10Z;
            M64 6c20 4 40 16 46 36 6 24-4 46-24 54-18 8-44 6-56-10-14-18-14-44 0-58C42 16 52 5 64 6Z;
            M62 8c22 2 42 18 46 38 4 22-8 44-28 52-18 8-42 4-54-12-14-18-12-46 4-60C40 14 50 7 62 8Z
          "
        />
      </path>
      <rect
        x="52"
        y="34"
        width="16"
        height="48"
        rx="5"
        transform="rotate(12 60 58)"
        fill="#1a1d27"
      />
    </svg>
  )
}
