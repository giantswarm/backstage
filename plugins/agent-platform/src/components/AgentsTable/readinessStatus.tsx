import BlockIcon from '@material-ui/icons/Block';
import CheckCircleIcon from '@material-ui/icons/CheckCircle';
import ErrorIcon from '@material-ui/icons/Error';
import HourglassEmptyIcon from '@material-ui/icons/HourglassEmpty';
import ReportProblemIcon from '@material-ui/icons/ReportProblem';
import { Cell, Flex, Text } from '@backstage/ui';
import {
  StatusLabel,
  type StatusLabelIntent,
} from '@giantswarm/backstage-plugin-ui-react';
import type { AgentReadiness } from '@giantswarm/backstage-plugin-kubernetes-react';
import type { AgentRow } from '../AgentsDataProvider';

/**
 * How each readiness state presents. Wording follows kagent's own UI so the two
 * agree; the icon and colour handling lives in `StatusLabel`.
 *
 * Icons are passed explicitly rather than relying on `StatusLabel`'s per-intent
 * defaults: `pending` reads far better as an hourglass than as the neutral
 * default circle, and naming the others keeps the whole set visible in one
 * place.
 *
 * `pending` is deliberately `neutral` rather than a warning: it means the
 * controller has not caught up with the current spec yet, which is "not known
 * yet", not "broken". `notAdmitted` is negative: no Harness will ever run this
 * agent until its labels change, and the tooltip says which label is missing.
 */
export const READINESS_PRESENTATION: Record<
  AgentReadiness,
  { label: string; intent: StatusLabelIntent; icon: typeof CheckCircleIcon }
> = {
  ready: { label: 'Ready', intent: 'positive', icon: CheckCircleIcon },
  notReady: { label: 'Not ready', intent: 'warning', icon: ReportProblemIcon },
  notAccepted: { label: 'Not accepted', intent: 'negative', icon: ErrorIcon },
  notAdmitted: { label: 'Not admitted', intent: 'negative', icon: BlockIcon },
  pending: { label: 'Pending', intent: 'neutral', icon: HourglassEmptyIcon },
};

/**
 * Tooltip for the readiness cell: the controller's own explanation for the
 * state, plus any Harness warnings. The warnings are independent of readiness,
 * so a ready agent can still have some.
 */
function getReadinessTitle(row: AgentRow): string | undefined {
  const lines = [
    row.readinessMessage,
    ...(row.warnings ?? []).map(warning => `Harness warning: ${warning}`),
  ].filter(Boolean);

  return lines.length > 0 ? lines.join('\n') : undefined;
}

/**
 * The readiness label and, underneath, the Harness whose verdict it is — the
 * one the agent's sessions run on. Nothing underneath while no Harness admits
 * the agent: the label and its tooltip already say so.
 */
export function AgentReadinessCell({ row }: { row: AgentRow }) {
  const { label, intent, icon } = READINESS_PRESENTATION[row.readiness];

  return (
    <Cell>
      <Flex direction="column" gap="1">
        <StatusLabel
          label={label}
          intent={intent}
          icon={icon}
          title={getReadinessTitle(row)}
        />
        {row.harness && (
          <Text
            variant="body-x-small"
            color="secondary"
            title={`Admitted by the Harness ${row.harness}`}
          >
            on {row.harness}
          </Text>
        )}
      </Flex>
    </Cell>
  );
}
