import { useEffect, useMemo, useState } from 'react';
import { useApi } from '@backstage/frontend-plugin-api';
import { Alert, Button, Flex, Text, ToggleButton } from '@backstage/ui';
import { makeStyles } from '@material-ui/core/styles';
import {
  CLUSTER_ACCESS_OFF_LABEL,
  CLUSTER_ACCESS_STATE_LABELS,
  CLUSTER_ACCESS_STATE_ORDER,
  CLUSTER_ACCESS_STATE_TONES,
  CLUSTER_ACCESS_SUMMARY_LABELS,
  type ClusterAccessState,
  mutedInstallationsApiRef,
  showsAccessReason,
  useClusterAccessStatus,
  useMutedInstallations,
  useSignInAgain,
} from '@giantswarm/backstage-plugin-gs';
import {
  StatusDot,
  type StatusDotTone,
  TOUCH_MEDIA,
} from '@giantswarm/backstage-plugin-ui-react';

/**
 * A chip's health: the access probe's state while it is on, `off` while it is
 * switched off (and so not probed), and `not-checked` while it is on without
 * a probe result, as for an installation without the token broker that the
 * person is not signed in to, which the classic widget does not list at all.
 */
export type EnvironmentHealth = ClusterAccessState | 'off' | 'not-checked';

const NOT_CHECKED_LABEL = 'Not checked';

function healthLabel(health: EnvironmentHealth): string {
  if (health === 'off') {
    return CLUSTER_ACCESS_OFF_LABEL;
  }
  if (health === 'not-checked') {
    return NOT_CHECKED_LABEL;
  }
  return CLUSTER_ACCESS_STATE_LABELS[health];
}

function healthTone(health: EnvironmentHealth): StatusDotTone {
  return health === 'off' || health === 'not-checked'
    ? 'neutral'
    : CLUSTER_ACCESS_STATE_TONES[health];
}

/**
 * A ring for a state that is in flight or needs attention, so it differs from
 * the filled dots by shape as well as colour.
 */
function healthRing(health: EnvironmentHealth): boolean {
  return (
    health === 'connecting' ||
    health === 'degraded' ||
    health === 'session-expired'
  );
}

export type EnvironmentItem = {
  name: string;
  /** The installation's pipeline, such as `stable` or `testing`. */
  pipeline?: string;
};

type EnvironmentChip = EnvironmentItem & {
  on: boolean;
  health: EnvironmentHealth;
  /** Why it is degraded or its session expired, from the access probe. */
  reason?: string;
};

function displayName({ name, pipeline }: EnvironmentItem): string {
  return pipeline ? `${name} (${pipeline})` : name;
}

/** The chip's accessible name: the environment, its pipeline, its health. */
function chipLabel(chip: EnvironmentChip): string {
  const health = healthLabel(chip.health);
  return chip.reason
    ? `${displayName(chip)}, ${health}: ${chip.reason}`
    : `${displayName(chip)}, ${health}`;
}

function chipTitle(chip: EnvironmentChip): string {
  const subject = `Environment ${displayName(chip)}.`;
  if (chip.health === 'off') {
    return `${subject} Off: the portal does not check or read it.`;
  }
  return chip.reason
    ? `${subject} ${healthLabel(chip.health)}: ${chip.reason}.`
    : `${subject} ${healthLabel(chip.health)}.`;
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
  // The chip is a bui ToggleButton: outlined while off, filled while on in
  // the pair a bui primary button paints, which flips with the theme (mockup,
  // variant B). The solid tokens are deprecated for `--bui-accent-*`, but the
  // shell's accent is the bright #009fff, under which white text fails
  // contrast (the precedent: UserMessage's bubble).
  chip: {
    height: 40,
    gap: 'var(--bui-space-2)',
    padding: '0 var(--bui-space-3)',
    borderRadius: 'var(--bui-radius-2)',
    boxShadow: 'inset 0 0 0 1px var(--bui-border-2)',
    background: 'var(--bui-bg-app)',
    color: 'var(--bui-fg-secondary)',
    fontWeight: 'var(--bui-font-weight-regular)' as never,
    fontSize: 'var(--bui-font-size-4)',
    '&[data-hovered]:not([data-selected])': {
      background: 'var(--bui-bg-neutral-2)',
      boxShadow: 'inset 0 0 0 1px var(--bui-ring)',
      color: 'var(--bui-fg-primary)',
    },
    '&[data-selected], &[data-pressed]': {
      // eslint-disable-next-line @backstage/no-deprecated-bui-tokens -- see above
      background: 'var(--bui-bg-solid)',
      boxShadow: 'none',
      // eslint-disable-next-line @backstage/no-deprecated-bui-tokens -- see above
      color: 'var(--bui-fg-solid)',
    },
    '&[data-selected][data-hovered]': {
      // eslint-disable-next-line @backstage/no-deprecated-bui-tokens -- see above
      background: 'var(--bui-bg-solid-hover)',
    },
    '&[data-focus-visible]': {
      outline: '2px solid var(--bui-ring)',
      outlineOffset: 2,
    },
    [TOUCH_MEDIA]: {
      height: 44,
    },
  },
  // A halo in the chip's text colour keeps the dot readable on the filled
  // chip, in either theme.
  dot: {
    display: 'inline-flex',
    borderRadius: '50%',
    '[data-selected] > * > &': {
      // eslint-disable-next-line @backstage/no-deprecated-bui-tokens -- the chip's text colour, see above
      boxShadow: '0 0 0 2px var(--bui-fg-solid)',
    },
  },
  attention: {
    listStyle: 'none',
    margin: 0,
    padding: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--bui-space-1)',
  },
});

export type EnvironmentTogglesProps = {
  /** Every configured installation, in display order. */
  installations: EnvironmentItem[];
};

/**
 * The environments this portal talks to, each a toggle chip with its access
 * health. It reads and writes the same stores as the classic sidebar's
 * Cluster access widget, and names the states with the same shared labels and
 * tones: the switched-off set (`mutedInstallationsApiRef`, which every fleet
 * read and the access probe skip) and the probe's results
 * (`useClusterAccessStatus`), so both always agree.
 */
export function EnvironmentToggles({ installations }: EnvironmentTogglesProps) {
  const classes = useStyles();
  const mutedApi = useApi(mutedInstallationsApiRef);
  const signInAgain = useSignInAgain();
  const muted = useMutedInstallations();
  const entries = useClusterAccessStatus();
  // The selection "All off" replaced, for its Undo. Dropped once anything
  // turns an environment on, here, in another tab or in the classic widget.
  const [beforeAllOff, setBeforeAllOff] = useState<string[] | undefined>();

  const chips = useMemo<EnvironmentChip[]>(() => {
    const mutedSet = new Set(muted);
    const entryByName = new Map(
      entries.map(entry => [entry.installation, entry]),
    );
    return installations.map(item => {
      const on = !mutedSet.has(item.name);
      const entry = on ? entryByName.get(item.name) : undefined;
      let health: EnvironmentHealth = 'off';
      if (on) {
        health = entry?.state ?? 'not-checked';
      }
      return {
        ...item,
        on,
        health,
        reason:
          entry && showsAccessReason(entry.state) ? entry.reason : undefined,
      };
    });
  }, [installations, muted, entries]);

  const names = useMemo(
    () => installations.map(item => item.name),
    [installations],
  );
  const onCount = chips.filter(chip => chip.on).length;
  const allOn = onCount === chips.length;
  const allOff = onCount === 0;
  const counts = (health: EnvironmentHealth) =>
    chips.filter(chip => chip.health === health).length;
  const notChecked = counts('not-checked');
  const attention = chips.filter(
    chip => chip.health === 'degraded' || chip.health === 'session-expired',
  );
  const expired = counts('session-expired') > 0;

  useEffect(() => {
    if (!allOff) {
      setBeforeAllOff(undefined);
    }
  }, [allOff]);

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
          {CLUSTER_ACCESS_STATE_ORDER.map(state => {
            const count = counts(state);
            return count > 0 ? (
              <StatusDot
                key={state}
                tone={healthTone(state)}
                ring={healthRing(state)}
                label={`${count} ${CLUSTER_ACCESS_SUMMARY_LABELS[state]}`}
              />
            ) : null;
          })}
          {notChecked > 0 && (
            <StatusDot tone="neutral" label={`${notChecked} not checked`} />
          )}
        </Flex>
        <Flex gap="2" role="group" aria-label="Turn all environments on or off">
          <Button
            variant="secondary"
            isDisabled={allOn}
            onPress={() => mutedApi.setMutedMany(names, false)}
          >
            All on
          </Button>
          <Button
            variant="secondary"
            isDisabled={allOff}
            onPress={() => {
              setBeforeAllOff(
                chips.filter(chip => chip.on).map(chip => chip.name),
              );
              mutedApi.setMutedMany(names, true);
            }}
          >
            All off
          </Button>
        </Flex>
      </Flex>
      {/* Every environment, wrapping, with no window and no search: a portal
          has dozens of environments, not hundreds, and a cap would hide the
          ones a person turns on (product decision). */}
      <ul aria-label="Environments" className={classes.list}>
        {chips.map(chip => (
          // The tooltip is a plain title on the item, since react-aria drops
          // a button's; the same facts are in the button's accessible name and,
          // for a problem, in the list under the chips.
          <li key={chip.name} title={chipTitle(chip)}>
            <ToggleButton
              className={classes.chip}
              size="medium"
              isSelected={chip.on}
              onChange={on => mutedApi.setMutedMany([chip.name], !on)}
              aria-label={chipLabel(chip)}
              iconStart={
                <span className={classes.dot}>
                  <StatusDot
                    tone={healthTone(chip.health)}
                    ring={healthRing(chip.health)}
                    size={10}
                  />
                </span>
              }
            >
              {chip.name}
            </ToggleButton>
          </li>
        ))}
      </ul>
      {attention.length > 0 && (
        <ul
          aria-label="Environments that need attention"
          className={classes.attention}
        >
          {attention.map(chip => (
            <li key={chip.name}>
              <StatusDot
                tone={healthTone(chip.health)}
                ring
                wrap
                label={`${displayName(chip)}: ${healthLabel(chip.health)}${
                  chip.reason ? `, ${chip.reason}` : ''
                }`}
              />
            </li>
          ))}
        </ul>
      )}
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
                onPress={() => mutedApi.setMutedMany(beforeAllOff, false)}
              >
                Undo
              </Button>
            ) : undefined
          }
        />
      )}
      {expired && (
        <Flex>
          <Button variant="primary" onPress={signInAgain}>
            Sign in again
          </Button>
        </Flex>
      )}
    </Flex>
  );
}
