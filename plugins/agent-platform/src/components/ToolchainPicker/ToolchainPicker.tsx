import { useMemo } from 'react';
import {
  Button,
  Checkbox,
  DialogTrigger,
  Flex,
  Popover,
  Select,
  Text,
} from '@backstage/ui';
import { makeStyles } from '@material-ui/core';
import BuildIcon from '@material-ui/icons/Build';

import { useAgentManagerInfo } from '../../hooks/useAgentManager';
import { useToolchains } from '../../hooks/useToolchainManager';
import {
  TOOLCHAINS_CAPABILITY,
  imageTag,
  samePicks,
  toolchainsLabel,
  type Toolchain,
  type ToolchainPick,
} from '../../lib/toolchainManager';
import type { AgentRow } from '../AgentsDataProvider';

/** The version option that follows the toolchain's newest release. */
const LATEST = 'latest';

const useStyles = makeStyles({
  trigger: {
    maxWidth: 280,
    minWidth: 0,
    '& > span': {
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      whiteSpace: 'nowrap',
    },
  },
  content: {
    padding: 'var(--bui-space-3)',
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--bui-space-3)',
    width: 'min(90vw, 360px)',
  },
  row: {
    display: 'grid',
    gridTemplateColumns: 'minmax(0, 1fr) 140px',
    alignItems: 'center',
    gap: 'var(--bui-space-2)',
  },
});

export type ToolchainPickerProps = {
  /** The chosen agent: its installation's toolchains are offered. */
  agent: AgentRow;
  /** The person's toolchains; `undefined` keeps the agent's defaults. */
  value: ToolchainPick[] | undefined;
  onChange: (picks: ToolchainPick[] | undefined) => void;
  isDisabled?: boolean;
};

/** The picks with `name` at `version` (absent: not mounted). */
function withPick(
  picks: readonly ToolchainPick[],
  name: string,
  version: string | undefined | null,
): ToolchainPick[] {
  const others = picks.filter(pick => pick.name !== name);
  if (version === null) {
    return others;
  }
  return [...others, version ? { name, version } : { name }].sort((a, b) =>
    a.name.localeCompare(b.name),
  );
}

/**
 * One row of the picker: a toolchain the installation offers, or a pick it
 * does not (an agent default from an unreachable or removed source), which
 * the person can still see and remove.
 */
export type PickerRow = { name: string; toolchain?: Toolchain };

/**
 * The picker's rows: one per name, since `start_session` names a toolchain
 * by its name alone (the first source listed wins where two publish one),
 * then every pick the list does not offer.
 */
export function pickerRows(
  toolchains: readonly Toolchain[],
  picks: readonly ToolchainPick[],
): PickerRow[] {
  const rows = new Map<string, PickerRow>();
  for (const toolchain of toolchains) {
    if (!rows.has(toolchain.name)) {
      rows.set(toolchain.name, { name: toolchain.name, toolchain });
    }
  }
  for (const pick of picks) {
    if (!rows.has(pick.name)) {
      rows.set(pick.name, { name: pick.name });
    }
  }
  return [...rows.values()];
}

/**
 * A row's version options: Latest and every published version, plus a
 * picked version the list no longer has, so the choice is never blank.
 */
export function versionOptions(
  row: PickerRow,
  pick: ToolchainPick | undefined,
) {
  const published = (row.toolchain?.versions ?? []).map(imageTag);
  const pinned = pick?.version ? imageTag(pick.version) : undefined;
  return [
    {
      id: LATEST,
      label: row.toolchain
        ? `Latest (${imageTag(row.toolchain.version)})`
        : 'Latest',
    },
    ...published.map(version => ({ id: version, label: version })),
    ...(pinned && !published.includes(pinned)
      ? [{ id: pinned, label: `${pinned} (not published)` }]
      : []),
  ];
}

/**
 * The composer's toolchains, beside the workspace: what the session mounts
 * under `/opt/kagent/tools`, preset to the agent's default toolchains. The
 * person adds or removes one and picks its version from the
 * toolchain-manager's list; a choice that matches the defaults again is the
 * defaults. Renders nothing where agent-manager mounts no toolchains or the
 * installation lists none.
 *
 * Keyed by the agent by its caller: another agent is another preset.
 */
export function ToolchainPicker({
  agent,
  value,
  onChange,
  isDisabled = false,
}: ToolchainPickerProps) {
  const classes = useStyles();
  const { info } = useAgentManagerInfo(agent.installation);
  const supported = Boolean(info?.capabilities?.[TOOLCHAINS_CAPABILITY]);
  const { list } = useToolchains(supported ? agent.installation : undefined);
  const defaults = useMemo(
    () => agent.defaultToolchains ?? [],
    [agent.defaultToolchains],
  );
  const picks = value ?? defaults;
  const toolchains = list.data?.toolchains ?? [];

  if (!supported || toolchains.length === 0) {
    return null;
  }

  const change = (next: ToolchainPick[]) =>
    onChange(samePicks(next, defaults) ? undefined : next);
  const summary = toolchainsLabel(picks);

  return (
    <DialogTrigger>
      <Button
        variant="tertiary"
        size="small"
        iconStart={<BuildIcon />}
        className={classes.trigger}
        isDisabled={isDisabled}
        aria-label={`Toolchains: ${summary}`}
      >
        {summary}
      </Button>
      {/* bui's Popover does not pass a name on, so the content is the named
          dialog. */}
      <Popover placement="bottom start">
        <div className={classes.content} role="dialog" aria-label="Toolchains">
          <Flex direction="column" gap="1">
            <Text variant="body-medium" weight="bold">
              Toolchains
            </Text>
            <Text variant="body-small" color="secondary">
              {value === undefined
                ? `${agent.name}’s defaults. The session mounts these tools beside its harness.`
                : `Changed for this session. The session mounts these tools beside its harness.`}
            </Text>
          </Flex>
          {pickerRows(toolchains, picks).map(row => {
            const pick = picks.find(p => p.name === row.name);
            return (
              <div key={row.name} className={classes.row}>
                <Checkbox
                  isSelected={Boolean(pick)}
                  onChange={selected =>
                    change(
                      withPick(picks, row.name, selected ? undefined : null),
                    )
                  }
                >
                  {row.toolchain ? row.name : `${row.name} (not offered here)`}
                </Checkbox>
                <Select
                  aria-label={`${row.name} version`}
                  size="small"
                  options={versionOptions(row, pick)}
                  selectedKey={pick?.version ? imageTag(pick.version) : LATEST}
                  isDisabled={!pick || !row.toolchain}
                  onSelectionChange={key =>
                    change(
                      withPick(
                        picks,
                        row.name,
                        !key || key === LATEST ? undefined : String(key),
                      ),
                    )
                  }
                />
              </div>
            );
          })}
          {value !== undefined && (
            <div>
              <Button
                variant="secondary"
                size="small"
                onPress={() => onChange(undefined)}
              >
                {defaults.length > 0
                  ? `Use ${agent.name}’s defaults`
                  : 'Mount no toolchains'}
              </Button>
            </div>
          )}
        </div>
      </Popover>
    </DialogTrigger>
  );
}
