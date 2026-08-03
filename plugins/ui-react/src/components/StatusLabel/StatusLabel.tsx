import CheckCircleIcon from '@material-ui/icons/CheckCircle';
import ErrorIcon from '@material-ui/icons/Error';
import InfoIcon from '@material-ui/icons/Info';
import RadioButtonUncheckedIcon from '@material-ui/icons/RadioButtonUnchecked';
import ReportProblemIcon from '@material-ui/icons/ReportProblem';
import { Flex, Text } from '@backstage/ui';

/**
 * What a status *means*, independent of the colour it happens to render as.
 *
 * These follow bui's current token vocabulary (`--bui-fg-positive` and friends)
 * rather than the `success`/`danger` spelling still used by bui's `Text` `color`
 * prop — at the token level those names are deprecated
 * (`@backstage/no-deprecated-bui-tokens`), and `neutral` has no equivalent in the
 * prop set at all.
 */
export type StatusLabelIntent =
  'positive' | 'warning' | 'negative' | 'info' | 'neutral';

/**
 * bui's current semantic foreground token per intent. Applied as the icon
 * wrapper's `color`, which the icon inherits through `fill: currentColor`, so a
 * status has exactly one colour source and adapts to light and dark.
 */
const INTENT_TOKEN: Record<StatusLabelIntent, string> = {
  positive: '--bui-fg-positive',
  warning: '--bui-fg-warning',
  negative: '--bui-fg-negative',
  info: '--bui-fg-announcement',
  neutral: '--bui-fg-secondary',
};

/**
 * Default icon per intent. Each is a filled Material variant with a distinct
 * silhouette — tick, triangle, circle, and so on — so a status stays legible
 * when colour is unavailable or unreliable (colour blindness, greyscale print).
 * Override via {@link StatusLabelProps.icon} when a domain has a more specific
 * glyph, e.g. an hourglass for "waiting".
 */
const INTENT_ICON: Record<StatusLabelIntent, typeof CheckCircleIcon> = {
  positive: CheckCircleIcon,
  warning: ReportProblemIcon,
  negative: ErrorIcon,
  info: InfoIcon,
  neutral: RadioButtonUncheckedIcon,
};

/**
 * Icon size, pinned rather than inherited, so every status in a list is the same
 * size regardless of the surrounding typography. (Material's icons size against
 * `MuiSvgIcon`'s own hardcoded font size, which does not track the label's.)
 */
const ICON_SIZE = '1.2rem';

export type StatusLabelProps = {
  /** Visible text. Kept as real text so assistive tech reads the status. */
  label: string;
  /** What the status means; selects the colour and the default icon. */
  intent: StatusLabelIntent;
  /**
   * Icon override for domains with a more specific glyph than the intent's
   * default. Pass a Material icon component, e.g. `HourglassEmpty`.
   */
  icon?: typeof CheckCircleIcon;
  /**
   * Detail shown on hover — typically the underlying reason a status is not
   * healthy. Rendered as a `title`, so keep it short enough to read as a
   * tooltip.
   */
  title?: string;
};

/**
 * An icon plus a label describing the state of something: a workload's
 * readiness, a run's outcome, a resource's health.
 *
 * Presentation only, and deliberately not wrapped in any layout — put it inside
 * a table `Cell`, a metadata row, or a card as needed.
 *
 * Two details it exists to get right once, both of which are easy to get wrong
 * per call site:
 *
 * - **The label is a sibling of the icon, never its child.** Material renders
 *   icons `aria-hidden`, so a label nested inside one is hidden from assistive
 *   tech too and the status reads as empty. (This is also why this does not
 *   build on `@backstage/core-components`' `Status*`, which puts `aria-hidden`
 *   on a span wrapping both its icon *and* its children.)
 * - **Colour comes from a single bui token**, inherited by the icon via
 *   `currentColor`, instead of the icon and text being coloured independently.
 *
 * The label itself stays in the default text colour: colour is carried by the
 * icon, so the text keeps full contrast against the background.
 */
export const StatusLabel = ({
  label,
  intent,
  icon,
  title,
}: StatusLabelProps) => {
  const Icon = icon ?? INTENT_ICON[intent];

  return (
    <Flex align="center" gap="2" title={title}>
      <span
        style={{
          display: 'flex',
          color: `var(${INTENT_TOKEN[intent]})`,
          fontSize: ICON_SIZE,
        }}
      >
        <Icon fontSize="inherit" />
      </span>
      <Text variant="body-medium">{label}</Text>
    </Flex>
  );
};
