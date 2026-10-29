import { StatusLabel } from '@giantswarm/backstage-plugin-ui-react';

/**
 * Marks the value a failed agent's root cause is about, so whoever fixes it
 * knows which field to change. The cause itself is in the banner above the
 * tabs.
 */
export function FailureMarker() {
  return <StatusLabel label="Cannot be resolved" intent="negative" />;
}
