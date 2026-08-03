import CheckCircleIcon from '@material-ui/icons/CheckCircle';
import ErrorIcon from '@material-ui/icons/Error';
import HourglassEmptyIcon from '@material-ui/icons/HourglassEmpty';
import ReportProblemIcon from '@material-ui/icons/ReportProblem';
import { Cell, Flex, Text } from '@backstage/ui';
import type { AgentReadiness } from '@giantswarm/backstage-plugin-kubernetes-react';
import type { AgentRow } from '../AgentsDataProvider';

/**
 * Icon size, pinned rather than inherited.
 *
 * `1.2rem` reproduces the size the shared `Status*` components produced, but the
 * two icon families they mix size by different mechanisms (`0.8em` against
 * `MuiSvgIcon`'s hardcoded 24px, versus `1.2em` against the inherited font
 * size), which agree only while the wrapper is 16px. Setting it here keeps all
 * four states the same size regardless of surrounding typography.
 */
const ICON_SIZE = '1.2rem';

/**
 * Label, icon and colour per readiness state.
 *
 * Wording follows kagent's own UI so the two agree. Icons are the filled
 * Material variants (rather than `@backstage/core-components`' `Status*`, whose
 * icons are hardcoded), each carrying a distinct shape — tick, triangle, circle,
 * hourglass — so the state is legible without relying on colour alone.
 *
 * Colours are bui's current semantic foreground tokens, so the icon and the rest
 * of the table share one theming source and adapt to light/dark. `token` is
 * applied as the wrapper's `color`, which the icon picks up via
 * `fill: currentColor`.
 *
 * Note the intent tokens are `positive`/`negative`, not `success`/`danger` —
 * the latter are deprecated (`@backstage/no-deprecated-bui-tokens`), even though
 * bui's `Text`/`CellText` `color` prop still spells them the old way.
 *
 * `pending` is deliberately neutral rather than a warning: it means the
 * controller has not caught up with the current spec yet, which is "not known
 * yet", not "broken".
 */
const READINESS_PRESENTATION: Record<
  AgentReadiness,
  { label: string; Icon: typeof CheckCircleIcon; token: string }
> = {
  ready: {
    label: 'Ready',
    Icon: CheckCircleIcon,
    token: '--bui-fg-positive',
  },
  notReady: {
    label: 'Not ready',
    Icon: ReportProblemIcon,
    token: '--bui-fg-warning',
  },
  notAccepted: {
    label: 'Not accepted',
    Icon: ErrorIcon,
    token: '--bui-fg-negative',
  },
  pending: {
    label: 'Pending',
    Icon: HourglassEmptyIcon,
    token: '--bui-fg-secondary',
  },
};

/**
 * Tooltip for the readiness cell: the controller's own explanation for the
 * state, plus any unsupported-features warning. The warning is independent of
 * readiness, so a ready agent can still have one.
 */
function getReadinessTitle(row: AgentRow): string | undefined {
  const lines = [
    row.readinessMessage,
    row.unsupportedFeaturesWarning &&
      `Unsupported features: ${row.unsupportedFeaturesWarning}`,
  ].filter(Boolean);

  return lines.length > 0 ? lines.join('\n') : undefined;
}

export function AgentReadinessCell({ row }: { row: AgentRow }) {
  const { label, Icon, token } = READINESS_PRESENTATION[row.readiness];

  // The label is real text alongside the icon, never inside it: MUI renders the
  // icon `aria-hidden`, so a label passed as its child would be hidden from
  // assistive tech too and the cell would read as empty. Keeping it a sibling
  // also means it uses bui's `body-medium`, matching every other cell here.
  return (
    <Cell>
      <Flex align="center" gap="2" title={getReadinessTitle(row)}>
        <span
          style={{
            display: 'flex',
            color: `var(${token})`,
            fontSize: ICON_SIZE,
          }}
        >
          <Icon fontSize="inherit" />
        </span>
        <Text variant="body-medium">{label}</Text>
      </Flex>
    </Cell>
  );
}
