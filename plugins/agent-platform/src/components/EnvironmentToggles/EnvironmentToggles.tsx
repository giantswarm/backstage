import { useMemo, useState } from 'react';
import { errorApiRef, useApi } from '@backstage/frontend-plugin-api';
import { Alert, Button, Flex, Text, ToggleButton } from '@backstage/ui';
import { makeStyles } from '@material-ui/core/styles';
import {
  type ClusterAccessStatusEntry,
  gsAuthProvidersApiRef,
  mutedInstallationsApiRef,
  useClusterAccessStatus,
  useMutedInstallations,
} from '@giantswarm/backstage-plugin-gs';
import {
  StatusDot,
  type StatusDotTone,
  TOUCH_MEDIA,
} from '@giantswarm/backstage-plugin-ui-react';

/**
 * What an environment's chip says about it. `off`: switched off, so not
 * checked. `unknown`: on, but no check result, as for an environment without
 * the token broker that the person is not signed in to.
 */
export type EnvironmentHealth =
  | 'off'
  | 'unknown'
  | 'checking'
  | 'healthy'
  | 'unreachable'
  | 'session-expired';

const HEALTH_DOT: Record<
  EnvironmentHealth,
  { tone: StatusDotTone; ring?: boolean }
> = {
  off: { tone: 'neutral' },
  unknown: { tone: 'neutral' },
  checking: { tone: 'neutral', ring: true },
  healthy: { tone: 'success' },
  unreachable: { tone: 'danger', ring: true },
  'session-expired': { tone: 'danger', ring: true },
};

/** The health word in a chip's accessible name. */
const HEALTH_WORDS: Record<EnvironmentHealth, string> = {
  off: 'off',
  unknown: 'not checked',
  checking: 'checking…',
  healthy: 'healthy',
  unreachable: 'unreachable',
  'session-expired': 'session expired',
};

type EnvironmentChip = {
  name: string;
  on: boolean;
  health: EnvironmentHealth;
  /** Why it is unreachable or its session expired, from the access check. */
  reason?: string;
};

export function environmentHealth(
  on: boolean,
  entry: ClusterAccessStatusEntry | undefined,
): EnvironmentHealth {
  if (!on) {
    return 'off';
  }
  switch (entry?.state) {
    case undefined:
      return 'unknown';
    case 'connecting':
      return 'checking';
    case 'healthy':
      return 'healthy';
    case 'degraded':
      return 'unreachable';
    case 'session-expired':
      return 'session-expired';
    default:
      return 'unknown';
  }
}

function chipTitle({ health, reason }: EnvironmentChip): string {
  switch (health) {
    case 'off':
      return 'Off. The portal does not check or read this environment.';
    case 'unknown':
      return 'Not checked. The portal has no access result for this environment.';
    case 'checking':
      return 'Checking access to this environment.';
    case 'healthy':
      return 'Healthy.';
    case 'unreachable':
      return `Unreachable: ${reason ?? 'the access check failed'}.`;
    case 'session-expired':
      return `Session expired: ${reason ?? 'sign in again to reach it'}.`;
    default:
      return '';
  }
}

function chipLabel(chip: EnvironmentChip): string {
  const word = HEALTH_WORDS[chip.health];
  return chip.reason &&
    (chip.health === 'unreachable' || chip.health === 'session-expired')
    ? `${chip.name}, ${word}: ${chip.reason}`
    : `${chip.name}, ${word}`;
}

const useStyles = makeStyles({
  list: {
    listStyle: 'none',
    margin: 0,
    padding: 0,
    display: 'flex',
    flexWrap: 'wrap',
    gap: 'var(--bui-space-2)',
  },
  // The chip is a bui ToggleButton, outlined while off and filled in the
  // shell's link blue while on (mockup, variant B).
  chip: {
    height: 40,
    gap: 'var(--bui-space-2)',
    padding: '0 var(--bui-space-3)',
    borderRadius: 'var(--bui-radius-2)',
    boxShadow: 'inset 0 0 0 1px var(--agent-shell-input-border, #c4d3dc)',
    background: 'var(--bui-bg-app)',
    color: 'var(--bui-fg-secondary)',
    fontWeight: 'var(--bui-font-weight-regular)' as never,
    fontSize: 'var(--bui-font-size-4)',
    '&[data-hovered]:not([data-selected])': {
      background: 'var(--bui-bg-neutral-1)',
      boxShadow: 'inset 0 0 0 1px var(--agent-shell-link, #00609c)',
    },
    '&[data-selected], &[data-pressed]': {
      background: 'var(--agent-shell-link, #00609c)',
      boxShadow: 'none',
      color: '#ffffff',
    },
    '&[data-selected][data-hovered]': {
      background: 'var(--agent-shell-link-hover, #002645)',
    },
    '&[data-focus-visible]': {
      outline: '2px solid var(--bui-ring)',
      outlineOffset: 2,
    },
    [TOUCH_MEDIA]: {
      height: 44,
    },
  },
  // A white halo keeps the dot readable on the filled chip.
  dot: {
    display: 'inline-flex',
    borderRadius: '50%',
    '[data-selected] > * > &': {
      boxShadow: '0 0 0 2px #ffffff',
    },
  },
});

export type EnvironmentTogglesProps = {
  /** Every configured installation, by name, in display order. */
  installations: string[];
};

/**
 * The environments this portal talks to, each a toggle chip with its access
 * health. It reads and writes the same stores as the classic sidebar's
 * Cluster access widget: the switched-off set (`mutedInstallationsApiRef`,
 * which every fleet read and the access probe skip) and the probe's health
 * (`useClusterAccessStatus`), so both always agree.
 */
export function EnvironmentToggles({ installations }: EnvironmentTogglesProps) {
  const classes = useStyles();
  const mutedApi = useApi(mutedInstallationsApiRef);
  const authProvidersApi = useApi(gsAuthProvidersApiRef);
  const errorApi = useApi(errorApiRef);
  const muted = useMutedInstallations();
  const entries = useClusterAccessStatus();
  // The selection "All off" replaced, for its Undo, until anything else
  // changes the selection.
  const [beforeAllOff, setBeforeAllOff] = useState<string[] | undefined>();

  const chips = useMemo<EnvironmentChip[]>(() => {
    const mutedSet = new Set(muted);
    const entryByName = new Map(
      entries.map(entry => [entry.installation, entry]),
    );
    return installations.map(name => {
      const on = !mutedSet.has(name);
      const entry = entryByName.get(name);
      const health = environmentHealth(on, entry);
      return {
        name,
        on,
        health,
        reason:
          health === 'unreachable' || health === 'session-expired'
            ? entry?.reason
            : undefined,
      };
    });
  }, [installations, muted, entries]);

  const count = (health: EnvironmentHealth) =>
    chips.filter(chip => chip.health === health).length;
  const onCount = chips.filter(chip => chip.on).length;
  const healthy = count('healthy');
  const unreachable = count('unreachable');
  const expired = count('session-expired');
  const checking = count('checking');
  const unknown = count('unknown');
  const allOn = onCount === chips.length;
  const allOff = onCount === 0;

  const setOn = (names: string[], on: boolean) => {
    setBeforeAllOff(undefined);
    mutedApi.setMutedMany(names, !on);
  };

  return (
    <Flex direction="column" gap="3">
      <Flex
        justify="between"
        align="center"
        gap="3"
        style={{ flexWrap: 'wrap' }}
      >
        <Flex
          align="center"
          gap="4"
          style={{ flexWrap: 'wrap' }}
          data-testid="environments-summary"
        >
          <Text variant="body-medium" color="secondary">
            <Text as="span" variant="body-medium" weight="bold">
              {onCount}
            </Text>{' '}
            of {chips.length} on
          </Text>
          {onCount > 0 && (
            <StatusDot tone="success" label={`${healthy} healthy`} />
          )}
          {unreachable > 0 && (
            <StatusDot
              tone="danger"
              ring
              label={`${unreachable} unreachable`}
            />
          )}
          {expired > 0 && (
            <StatusDot
              tone="danger"
              ring
              label={`${expired} session expired`}
            />
          )}
          {checking > 0 && (
            <StatusDot tone="neutral" ring label={`${checking} checking…`} />
          )}
          {unknown > 0 && (
            <StatusDot tone="neutral" label={`${unknown} not checked`} />
          )}
        </Flex>
        <Flex gap="2" role="group" aria-label="Turn all environments on or off">
          <Button
            variant="secondary"
            isDisabled={allOn}
            onPress={() => setOn(installations, true)}
          >
            All on
          </Button>
          <Button
            variant="secondary"
            isDisabled={allOff}
            onPress={() => {
              const before = chips
                .filter(chip => chip.on)
                .map(chip => chip.name);
              mutedApi.setMutedMany(installations, true);
              setBeforeAllOff(before);
            }}
          >
            All off
          </Button>
        </Flex>
      </Flex>
      {/* Every environment, wrapping: a fleet of 50 is a few rows of chips,
          and a cap would hide the ones a person turns on (product decision). */}
      <ul aria-label="Environments" className={classes.list}>
        {chips.map(chip => (
          // The state in a plain title on the item, since react-aria drops a
          // button's: a bui Tooltip would cover the neighbouring chips.
          <li key={chip.name} title={chipTitle(chip)}>
            <ToggleButton
              className={classes.chip}
              size="medium"
              isSelected={chip.on}
              onChange={on => setOn([chip.name], on)}
              aria-label={chipLabel(chip)}
              iconStart={
                <span className={classes.dot}>
                  <StatusDot {...HEALTH_DOT[chip.health]} size={10} />
                </span>
              }
            >
              {chip.name}
            </ToggleButton>
          </li>
        ))}
      </ul>
      {allOff && (
        <Alert
          status="warning"
          icon
          title="All environments are off, so the portal shows nothing. Turn on the ones you work with."
          customActions={
            beforeAllOff && beforeAllOff.length > 0 ? (
              <Button
                variant="tertiary"
                size="small"
                onPress={() => setOn(beforeAllOff, true)}
              >
                Undo
              </Button>
            ) : undefined
          }
        />
      )}
      {expired > 0 && (
        <Flex>
          <Button
            variant="primary"
            onPress={() => {
              Promise.resolve()
                .then(() => authProvidersApi.getMainAuthApi().signIn())
                .catch(error => errorApi.post(error));
            }}
          >
            Sign in again
          </Button>
        </Flex>
      )}
    </Flex>
  );
}
