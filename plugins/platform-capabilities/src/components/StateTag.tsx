import { Text } from '@backstage/ui';
import {
  CapabilityState,
  CapabilityStateName,
  VerifyMark,
  VerifyResult,
} from '../apis';
import { count, differencesOf, redProbeOf } from '../lib/comparison';

/** The colour of each state and comparison mark, shared by the tag and the icon. */
export const STATE_COLOR: Record<CapabilityStateName | VerifyMark, string> = {
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
};

/** The page's word for each of the manager's states; the manager's own never appear. */
export const STATE_WORDS: Record<CapabilityStateName, string> = {
  'not opted in': 'Not installed',
  'not enabled': 'Not installed',
  'pending approval': 'Pending approval',
  'rolling out': 'Rolling out',
  'waiting for the customer': 'Waiting for the customer',
  enabled: 'Installed',
  drifted: 'Installed · differences',
  failed: 'Failed',
  unknown: 'Unknown',
};

/** What the page says about a capability, and the colour it says it in. */
export interface Status {
  words: string;
  tone: CapabilityStateName;
}

/**
 * The header line of a capability: its phase and, after the middle dot or
 * the colon, what the comparison found -- the differences, the customer's
 * action, the red probe. Without a comparison (the Installations page, the
 * comparison still running) the phase alone, in the same words.
 */
export function statusOf(
  capability: Pick<CapabilityState, 'state' | 'lastAction'>,
  comparison?: VerifyResult,
): Status {
  const { state } = capability;
  switch (state) {
    case 'enabled':
    case 'drifted': {
      if (!comparison) {
        return { words: STATE_WORDS[state], tone: state };
      }
      const n = differencesOf(comparison);
      return n === 0
        ? { words: 'Installed · up to date', tone: 'enabled' }
        : { words: `Installed · ${count(n, 'difference')}`, tone: 'drifted' };
    }
    case 'pending approval':
    case 'rolling out': {
      const verb = capability.lastAction?.name.startsWith('reconcile')
        ? 'Applying'
        : 'Enabling';
      return { words: `${verb} · ${state}`, tone: state };
    }
    case 'waiting for the customer': {
      const action = comparison?.customerActions?.[0]?.action;
      return {
        words: action ? `${STATE_WORDS[state]}: ${action}` : STATE_WORDS[state],
        tone: state,
      };
    }
    case 'failed': {
      const probe = redProbeOf(comparison);
      return {
        words: probe ? `${STATE_WORDS[state]}: ${probe}` : STATE_WORDS[state],
        tone: state,
      };
    }
    default:
      return {
        words: STATE_WORDS[state] ?? STATE_WORDS.unknown,
        tone: state in STATE_WORDS ? state : 'unknown',
      };
  }
}

function Dot({
  color,
  words,
  testId,
  state,
}: {
  color: string;
  words: string;
  testId?: string;
  state: string;
}) {
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
        {words}
      </Text>
    </span>
  );
}

/**
 * A capability's state in the page's words with a dot in its colour;
 * `data-state` keeps the manager's state for tests. With a `status` the tag
 * carries the header line the comparison produced instead.
 */
export function StateTag({
  state,
  status = statusOf({ state }),
  testId,
}: {
  state: CapabilityStateName;
  status?: Status;
  testId?: string;
}) {
  return (
    <Dot
      color={STATE_COLOR[status.tone] ?? STATE_COLOR.unknown}
      words={status.words}
      state={state}
      testId={testId}
    />
  );
}

/** A comparison mark with a dot in its colour: `as defined`, `differs by input`, `drifted`, `not checked`. */
export function MarkTag({
  mark,
  testId,
}: {
  mark: VerifyMark;
  testId?: string;
}) {
  return (
    <Dot
      color={STATE_COLOR[mark] ?? STATE_COLOR.unknown}
      words={mark}
      state={mark}
      testId={testId}
    />
  );
}
