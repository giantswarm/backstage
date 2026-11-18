import CheckCircleIcon from '@material-ui/icons/CheckCircle';
import ErrorIcon from '@material-ui/icons/Error';
import HourglassEmptyIcon from '@material-ui/icons/HourglassEmpty';
import { Cell } from '@backstage/ui';
import {
  StatusLabel,
  type StatusLabelIntent,
} from '@giantswarm/backstage-plugin-ui-react';
import type { ModelConfigReadiness } from '@giantswarm/backstage-plugin-kubernetes-react';
import type { ModelRow } from './ModelsTable';

/**
 * How each readiness state presents. A ModelConfig has no workload, so there
 * are only the controller's `Accepted` and `ResolvedRefs` verdicts: `accepted`
 * (both true) reads as positive, `notAccepted` as negative (typically a
 * missing or malformed key Secret, which the tooltip explains), and `pending`
 * as neutral "not known yet" — same reasoning as the agents' readiness cell.
 */
export const MODEL_READINESS_PRESENTATION: Record<
  ModelConfigReadiness,
  { label: string; intent: StatusLabelIntent; icon: typeof CheckCircleIcon }
> = {
  accepted: { label: 'Accepted', intent: 'positive', icon: CheckCircleIcon },
  notAccepted: { label: 'Not accepted', intent: 'negative', icon: ErrorIcon },
  pending: { label: 'Pending', intent: 'neutral', icon: HourglassEmptyIcon },
};

/** A ModelConfig's readiness as a label, the controller's message on hover. */
export function ModelReadinessLabel({
  readiness,
  message,
}: {
  readiness: ModelConfigReadiness;
  message?: string;
}) {
  const { label, intent, icon } = MODEL_READINESS_PRESENTATION[readiness];
  return (
    <StatusLabel label={label} intent={intent} icon={icon} title={message} />
  );
}

export function ModelReadinessCell({ row }: { row: ModelRow }) {
  return (
    <Cell>
      <ModelReadinessLabel
        readiness={row.readiness}
        message={row.readinessMessage}
      />
    </Cell>
  );
}
