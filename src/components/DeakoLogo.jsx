/**
 * Deako wordmark logo rendered as inline SVG.
 * Uses Inter Black (approved alternate font per brand guidelines).
 * On dark backgrounds: white logo. On light backgrounds: black logo.
 *
 * Brand ref: Logo must be ≥30px wide, white on dark per usage guidelines.
 */
export default function DeakoLogo({ height = 20, color = '#FAFAFA', className = '' }) {
  // Aspect ratio based on "deako" wordmark proportions
  const width = height * 3.2

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 128 40"
      width={width}
      height={height}
      className={className}
      role="img"
      aria-label="Deako"
    >
      <text
        x="0"
        y="34"
        fontFamily="'Inter', sans-serif"
        fontWeight="900"
        fontSize="38"
        letterSpacing="-1.5"
        fill={color}
      >
        deako
      </text>
    </svg>
  )
}
