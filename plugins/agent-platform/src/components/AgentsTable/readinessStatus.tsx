import BlockIcon from '@material-ui/icons/Block';
import CheckCircleIcon from '@material-ui/icons/CheckCircle';
import ErrorIcon from '@material-ui/icons/Error';
import HourglassEmptyIcon from '@material-ui/icons/HourglassEmpty';
import ReportProblemIcon from '@material-ui/icons/ReportProblem';
import { Cell, Flex } from '@backstage/ui';
import {
  InfoHint,
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
 * agent until its labels change, and the info icon says which label is missing.
 */
/** How one readiness is shown: its label, the label's intent and its icon. */
export type ReadinessPresentation = {
  label: string;
  intent: StatusLabelIntent;
  icon: typeof CheckCircleIcon;
};

export const READINESS_PRESENTATION: Record<
  AgentReadiness,
  ReadinessPresentation
> = {
  ready: { label: 'Ready', intent: 'positive', icon: CheckCircleIcon },
  notReady: { label: 'Not ready', intent: 'warning', icon: ReportProblemIcon },
  notAccepted: { label: 'Not accepted', intent: 'negative', icon: ErrorIcon },
  notAdmitted: { label: 'Not admitted', intent: 'negative', icon: BlockIcon },
  pending: { label: 'Pending', intent: 'neutral', icon: HourglassEmptyIcon },
};

/**
 * Explanation behind the readiness cell's info icon: the controller's own
 * reason for the state, plus any Harness warnings. The warnings are independent
 * of readiness, so a ready agent can still have some.
 */
function getReadinessHint(row: AgentRow): string | undefined {
  const lines = [
    row.readinessMessage,
    ...(row.warnings ?? []).map(warning => `Harness warning: ${warning}`),
  ].filter(Boolean);

  return lines.length > 0 ? lines.join('\n') : undefined;
}

/**
 * The readiness label and, when there is something to explain, an info icon
 * whose tooltip says why.
 */
export function AgentReadinessCell({ row }: { row: AgentRow }) {
  const { label, intent, icon } = READINESS_PRESENTATION[row.readiness];
  const hint = getReadinessHint(row);

  return (
    <Cell>
      <Flex align="center" gap="1">
        <StatusLabel label={label} intent={intent} icon={icon} />
        {hint && (
          <InfoHint
            size="medium"
            label={
              row.readinessMessage
                ? `Why ${row.name} is ${label.toLowerCase()}`
                : `Harness warnings for ${row.name}`
            }
          >
            {hint}
          </InfoHint>
        )}
      </Flex>
    </Cell>
  );
}
