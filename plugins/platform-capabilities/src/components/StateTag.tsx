import { Text } from '@backstage/ui';
import { CapabilityStateName } from '../apis';
import { CellMark } from './consistency';

const COLOR: Record<CapabilityStateName | CellMark, string> = {
  'not opted in': '#8a8a8a',
  'not enabled': '#8a8a8a',
  'pending approval': '#b8860b',
  'rolling out': '#1e7fd8',
  'waiting for the customer': '#b8860b',
  enabled: '#2e8b57',
  drifted: '#d2691e',
  failed: '#c62828',
  unknown: '#8a8a8a',
  'as defined': '#2e8b57',
  'differs by input': '#b8860b',
  'not checked': '#8a8a8a',
  'not readable': '#8a8a8a',
};

/**
 * A capability's state, or a verify mark, in the manager's words, with a dot
 * in its colour.
 */
export function StateTag({
  state,
  testId,
}: {
  state: CapabilityStateName | CellMark | string;
  testId?: string;
}) {
  const color = COLOR[state as keyof typeof COLOR] ?? COLOR.unknown;
  return (
    <span
      data-testid={testId}
      data-state={state}
      style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
    >
      <span
        aria-hidden
        style={{
          width: 8,
          height: 8,
          borderRadius: 4,
          background: color,
          flexShrink: 0,
        }}
      />
      <Text as="span" variant="body-small">
        {state}
      </Text>
    </span>
  );
}
