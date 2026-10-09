/**
 * The shell's share glyph, as the prototype draws it: an arrow leaving a tray.
 * An inline SVG for the same reason as `PinIcon` — the MUI v4 icon set the
 * portal ships has no iOS-style share (it arrived in v5), and mixing one v5
 * icon in would drag in a second icon package.
 *
 * Decorative: the button around it carries the label.
 */
export function ShareIcon({ size = 18 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M12 3v12M7 8l5-5 5 5" />
      <path d="M5 14v5a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-5" />
    </svg>
  );
}
