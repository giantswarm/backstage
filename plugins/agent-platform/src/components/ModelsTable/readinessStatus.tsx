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
import {
  MODEL_CONFIGURED_LABEL,
  modelConfiguredDetail,
} from '../../lib/modelConfigStatus';

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
  accepted: {
    label: MODEL_CONFIGURED_LABEL,
    intent: 'positive',
    icon: CheckCircleIcon,
  },
  notAccepted: { label: 'Not accepted', intent: 'negative', icon: ErrorIcon },
  pending: { label: 'Pending', intent: 'neutral', icon: HourglassEmptyIcon },
};

/** A ModelConfig's configuration verdict and explanation. */
export function ModelReadinessLabel({
  readiness,
  message,
  apiKeySecret,
}: {
  readiness: ModelConfigReadiness;
  message?: string;
  apiKeySecret?: string;
}) {
  const { label, intent, icon } = MODEL_READINESS_PRESENTATION[readiness];
  return (
    <StatusLabel
      label={label}
      intent={intent}
      icon={icon}
      title={
        readiness === 'accepted' ? modelConfiguredDetail(apiKeySecret) : message
      }
    />
  );
}

export function ModelReadinessCell({ row }: { row: ModelRow }) {
  return (
    <Cell>
      <ModelReadinessLabel
        readiness={row.readiness}
        message={row.readinessMessage}
        apiKeySecret={row.apiKeySecret}
      />
    </Cell>
  );
}
