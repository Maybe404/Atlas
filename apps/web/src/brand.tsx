// The single source of truth for the Atlas product mark — the boxed "A" used on
// the cover. Everywhere a logo appears (topbar, login, landing, favicon) renders
// this same glyph so the brand stays consistent. Strokes use currentColor, so the
// surrounding element controls the color.

export function BrandMark({
  size = 24,
  strokeWidth = 1.9,
}: {
  size?: number;
  strokeWidth?: number;
}) {
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 44 44" fill="none">
      <rect
        x="6"
        y="6"
        width="32"
        height="32"
        rx="8"
        stroke="currentColor"
        strokeWidth={strokeWidth}
      />
      <path
        d="M14 29 L22 13 L30 29"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      <path
        d="M17.4 23 L26.6 23"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
      />
    </svg>
  );
}
