/**
 * The shell's pin glyph, as the prototype draws it. An inline SVG because the
 * MUI v4 icon set the portal ships has no push-pin (it arrived in v5), and
 * mixing one v5 icon in for this would drag in a second icon package.
 *
 * Outline when `filled` is false (the "pin this" affordance), solid when true
 * (the thing is pinned). Decorative: the button around it carries the label.
 */
export function PinIcon({
  filled = false,
  size = 16,
}: {
  filled?: boolean;
  size?: number;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={filled ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M15 3l6 6-3 1-4 4 1 5-2 2-4-4-5 5-1-1 5-5-4-4 2-2 5 1 4-4z" />
    </svg>
  );
}
