import { useEffect, useMemo, useRef, useState } from 'react';
import { Select, Text } from '@backstage/ui';
import { makeStyles } from '@material-ui/core';
import {
  isSearchableList,
  matchesQuery,
} from '@giantswarm/backstage-plugin-ui-react';

import {
  useLastWorkspace,
  useSessionWorkspaces,
} from '../../hooks/useSessionWorkspaces';
import { syncedAgo } from '../../lib/sessionWorkspace';
import type { Workspace } from '../../lib/workspaceManager';
import type { AgentRow } from '../AgentsDataProvider';

/** The option that starts the plain session. */
const NO_WORKSPACE_ID = 'workspace:none';

const useStyles = makeStyles({
  // Compact like the agent picker beside it: the prompt stays the hero.
  select: {
    maxWidth: 240,
    minWidth: 0,
  },
  label: {
    whiteSpace: 'nowrap',
  },
});

/**
 * Under a workspace's name in the picker: its Organization where the person
 * has more than one, its repository count and its last sync.
 */
export function workspaceOptionDescription(
  workspace: Workspace,
  multipleOrganizations: boolean,
  now = new Date(),
): string {
  const count = `${workspace.repositories} ${
    workspace.repositories === 1 ? 'repository' : 'repositories'
  }`;
  return [
    ...(multipleOrganizations ? [workspace.organization] : []),
    count,
    syncedAgo(workspace.lastSync?.time, now),
  ].join(' · ');
}

export type WorkspacePickerProps = {
  /** The chosen agent: its installation's workspaces are offered. */
  agent: AgentRow;
  /** The chosen workspace; `undefined` is "No workspace". */
  value: Workspace | undefined;
  onChange: (workspace: Workspace | undefined) => void;
  isDisabled?: boolean;
  /**
   * Says "Workspace" before the select, as the agent picker's own label
   * does where the pickers head the box.
   */
  showLabel?: boolean;
};

/** Where a preset came from, as the line beside the select says. */
type PresetSource = 'last' | 'default';

/**
 * The workspace a new session with `agent` starts preset to: the one last
 * chosen with the agent in this browser, else the agent's default workspace,
 * else none ("Last choice first"). A last choice of "No workspace" is a
 * choice and presets none; a remembered or default workspace that is not
 * listed (gone, or not the person's) is passed over.
 */
export function presetWorkspace(
  remembered: string | null | undefined,
  agentDefault: string | undefined,
  workspaces: Workspace[],
): { workspace: Workspace; source: PresetSource } | undefined {
  if (remembered === null) {
    return undefined;
  }
  const listed = (name: string | undefined) =>
    name ? workspaces.find(workspace => workspace.name === name) : undefined;
  const last = listed(remembered);
  if (last) {
    return { workspace: last, source: 'last' };
  }
  const fallback = listed(agentDefault);
  return fallback ? { workspace: fallback, source: 'default' } : undefined;
}

/**
 * The composer's optional workspace, beside the agent picker: the workspaces
 * of the chosen agent's installation across the person's Organizations, and
 * "No workspace". Preset by {@link presetWorkspace}: the one last chosen with
 * this agent here, else the agent's default workspace, else none; a choice is
 * remembered for the agent. Renders nothing where the installation offers no
 * workspace, so the composer reads as before.
 *
 * Keyed by the agent by its caller: another agent is another preset.
 */
export function WorkspacePicker({
  agent,
  value,
  onChange,
  isDisabled = false,
  showLabel = false,
}: WorkspacePickerProps) {
  const classes = useStyles();
  const { workspaces } = useSessionWorkspaces(agent.installation);
  const { lastWorkspaceOf, rememberWorkspace } = useLastWorkspace();
  const [searchText, setSearchText] = useState('');

  // The preset is adopted once the workspaces are listed, unless the person
  // chose meanwhile.
  const touched = useRef(false);
  const [preset, setPreset] = useState<{
    name: string;
    source: PresetSource;
  }>();
  const remembered = lastWorkspaceOf(agent.id);
  useEffect(() => {
    if (touched.current || preset) {
      return;
    }
    const found = presetWorkspace(
      remembered,
      agent.defaultWorkspace,
      workspaces,
    );
    if (found) {
      setPreset({ name: found.workspace.name, source: found.source });
      onChange(found.workspace);
    }
  }, [workspaces, remembered, agent.defaultWorkspace, preset, onChange]);

  const multipleOrganizations =
    new Set(workspaces.map(workspace => workspace.organization)).size > 1;
  const options = useMemo(() => {
    const listed = workspaces.map(workspace => ({
      id: workspace.name,
      label: workspace.name,
      description: workspaceOptionDescription(workspace, multipleOrganizations),
    }));
    const all = [...listed, { id: NO_WORKSPACE_ID, label: 'No workspace' }];
    return searchText.trim()
      ? all.filter(option =>
          matchesQuery(
            searchText,
            `${option.label} ${'description' in option ? option.description : ''}`,
          ),
        )
      : all;
  }, [workspaces, multipleOrganizations, searchText]);

  if (workspaces.length === 0) {
    return null;
  }

  const isSearchable = isSearchableList(workspaces.length);

  return (
    <>
      {showLabel && (
        <Text as="span" variant="body-small" className={classes.label}>
          Workspace
        </Text>
      )}
      <Select
        aria-label="Workspace"
        className={classes.select}
        options={options}
        selectedKey={value?.name ?? NO_WORKSPACE_ID}
        onSelectionChange={key => {
          setSearchText('');
          const id = key ? String(key) : NO_WORKSPACE_ID;
          const workspace = workspaces.find(w => w.name === id);
          touched.current = true;
          rememberWorkspace(agent.id, workspace?.name);
          onChange(workspace);
        }}
        onOpenChange={isOpen => {
          if (!isOpen) {
            setSearchText('');
          }
        }}
        {...(isSearchable && {
          search: {
            inputValue: searchText,
            onInputChange: setSearchText,
            placeholder: `Search ${workspaces.length} workspaces`,
            filter: () => true,
          },
        })}
        isDisabled={isDisabled}
      />
      {preset && value?.name === preset.name && !touched.current && (
        <Text as="span" variant="body-small" color="secondary">
          {preset.source === 'last'
            ? `Last used with ${agent.name}`
            : `${agent.name}’s default`}
        </Text>
      )}
    </>
  );
}
