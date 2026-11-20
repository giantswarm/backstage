import { Text } from '@backstage/ui';
import { StatusDot } from '@giantswarm/backstage-plugin-ui-react';
import type { StatusView } from '../utils/gateways';

/** A reason is a CamelCase identifier: monospace, breaking anywhere. */
const REASON = {
  fontFamily: 'var(--bui-font-monospace, monospace)',
  overflowWrap: 'anywhere',
} as const;

/**
 * One status of the Gateways tab: a dot and a word ("Programmed", "Not
 * accepted"), and under a failing one its reason, as the controller wrote it.
 */
export function PlatformGatewayStatus({ status }: { status: StatusView }) {
  return (
    <div
      style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}
      title={status.title}
    >
      <StatusDot tone={status.tone} label={status.label} wrap />
      {status.reason ? (
        <Text as="span" variant="body-small" color="secondary" style={REASON}>
          {status.reason}
        </Text>
      ) : null}
      {status.note ? (
        <Text as="span" variant="body-small" color="secondary">
          {status.note}
        </Text>
      ) : null}
    </div>
  );
}
