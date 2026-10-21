import { useEffect, useMemo, useRef, useState } from 'react';
import { Select, Text } from '@backstage/ui';
import { makeStyles } from '@material-ui/core';
import {
  SEARCH_MIN,
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

/**
 * The composer's optional workspace, beside the agent picker: the workspaces
 * of the chosen agent's installation across the person's Organizations, and
 * "No workspace". Preset to the one last chosen with this agent here, else
 * none; a choice is remembered for the agent. Renders nothing where the
 * installation offers no workspace, so the composer reads as before.
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

  // The remembered workspace is adopted once it is listed, unless the person
  // chose meanwhile; it is gone when it is no longer listed.
  const touched = useRef(false);
  const [preset, setPreset] = useState<string>();
  const remembered = lastWorkspaceOf(agent.id);
  useEffect(() => {
    if (touched.current || preset || !remembered) {
      return;
    }
    const found = workspaces.find(workspace => workspace.name === remembered);
    if (found) {
      setPreset(found.name);
      onChange(found);
    }
  }, [workspaces, remembered, preset, onChange]);

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

  const isSearchable = workspaces.length + 1 > SEARCH_MIN;

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
      {preset && value?.name === preset && !touched.current && (
        <Text as="span" variant="body-small" color="secondary">
          Last used with {agent.name}
        </Text>
      )}
    </>
  );
}
