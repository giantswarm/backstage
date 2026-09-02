import CheckCircleIcon from '@material-ui/icons/CheckCircle';
import ErrorIcon from '@material-ui/icons/Error';
import HourglassEmptyIcon from '@material-ui/icons/HourglassEmpty';
import StorageIcon from '@material-ui/icons/Storage';
import { Cell } from '@backstage/ui';
import {
  StatusLabel,
  type StatusLabelIntent,
} from '@giantswarm/backstage-plugin-ui-react';
import type { ServedModelReadiness } from '../../lib/serving';

/**
 * How each served-model readiness presents: `ready` positive, `available`
 * informational (downloaded, not in memory — a disk, not a fault), `notReady`
 * negative (rolling out or failed — the tooltip carries the backend's
 * explanation), `pending` neutral "not known yet". Same vocabulary as the
 * ModelConfig and Agent readiness cells so the tab reads as one.
 */
export const SERVED_READINESS_PRESENTATION: Record<
  ServedModelReadiness,
  { label: string; intent: StatusLabelIntent; icon: typeof CheckCircleIcon }
> = {
  ready: { label: 'Ready', intent: 'positive', icon: CheckCircleIcon },
  available: { label: 'Available', intent: 'info', icon: StorageIcon },
  notReady: { label: 'Not ready', intent: 'negative', icon: ErrorIcon },
  pending: { label: 'Pending', intent: 'neutral', icon: HourglassEmptyIcon },
};

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
