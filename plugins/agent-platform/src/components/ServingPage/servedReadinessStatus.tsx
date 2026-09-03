import type CheckCircleIcon from '@material-ui/icons/CheckCircle';
import { Cell } from '@backstage/ui';
import {
  StatusLabel,
  type StatusLabelIntent,
} from '@giantswarm/backstage-plugin-ui-react';
import {
  SERVED_MODEL_READINESS,
  type ServedModelReadiness,
} from '../../lib/serving';
import { SERVED_READINESS_ICON } from '../ModelServingStatus/readinessIcon';

type Presentation = {
  label: string;
  intent: StatusLabelIntent;
  icon: typeof CheckCircleIcon;
};

/**
 * How each served-model readiness presents: the label and intent of the
 * shared vocabulary (`lib/serving.ts` — one place, every table) plus the
 * shared glyph. Same words as the ModelConfig and Agent readiness cells so the
 * tab reads as one.
 */
export const SERVED_READINESS_PRESENTATION: Record<
  ServedModelReadiness,
  Presentation
> = Object.fromEntries(
  (Object.keys(SERVED_MODEL_READINESS) as ServedModelReadiness[]).map(
    readiness => [
      readiness,
      {
        label: SERVED_MODEL_READINESS[readiness].label,
        intent: SERVED_MODEL_READINESS[readiness].intent,
        icon: SERVED_READINESS_ICON[readiness],
      },
    ],
  ),
) as Record<ServedModelReadiness, Presentation>;

export function ServedReadinessCell({
  readiness,
  message,
}: {
  readiness: ServedModelReadiness;
  message?: string;
}) {
  const { label, intent, icon } = SERVED_READINESS_PRESENTATION[readiness];

  return (
    <Cell>
      <StatusLabel label={label} intent={intent} icon={icon} title={message} />
    </Cell>
  );
}
