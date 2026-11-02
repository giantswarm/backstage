import { useMemo } from 'react';
import { Select } from '@backstage/ui';
import { searchableIf } from '@giantswarm/backstage-plugin-ui-react';

import { useAgentManagerInfo } from '../../hooks/useAgentManager';
import { useSessionWorkspaces } from '../../hooks/useSessionWorkspaces';
import { DEFAULT_WORKSPACE_CAPABILITY } from '../../lib/defaultWorkspace';
import { useNewAgentForm } from '../NewAgentFormProvider';

/** The option that leaves the agent without a default. */
const NO_DEFAULT_ID = 'workspace:none';

export const DEFAULT_WORKSPACE_DESCRIPTION =
  'Its sessions start in this workspace unless the person starting one picks another or none. Each start checks that they can read its repositories.';

/**
 * The agent form's optional **Default workspace**: one of the workspaces on
 * the agent's environment (`list_workspaces`, as the person), or none.
 * Offered where agent-manager starts a session in an agent's default
 * (`get_info`'s `defaultWorkspace` capability) and the environment lists a
 * workspace; an edited agent's default is offered even when it is no longer
 * listed, so it is kept or removed on purpose, never dropped unseen.
 */
export function DefaultWorkspacePicker() {
  const { state, setDefaultWorkspace } = useNewAgentForm();
  const installation = state.installation;
  const { info } = useAgentManagerInfo(installation);
  const { workspaces } = useSessionWorkspaces(installation ?? '');
  const current = state.defaultWorkspace;

  const options = useMemo(() => {
    const listed = workspaces.map(workspace => ({
      id: workspace.name,
      label: workspace.name,
    }));
    const unlisted =
      current && !workspaces.some(workspace => workspace.name === current)
        ? [{ id: current, label: `${current} (not listed for you)` }]
        : [];
    return [
      { id: NO_DEFAULT_ID, label: 'No default workspace' },
      ...listed,
      ...unlisted,
    ];
  }, [workspaces, current]);

  const supported = Boolean(info?.capabilities?.[DEFAULT_WORKSPACE_CAPABILITY]);
  if (!installation || !supported || (workspaces.length === 0 && !current)) {
    return null;
  }

  return (
    <Select
      label="Default workspace"
      secondaryLabel="optional"
      description={DEFAULT_WORKSPACE_DESCRIPTION}
      searchable={searchableIf(options)}
      options={options}
      selectedKey={current || NO_DEFAULT_ID}
      onSelectionChange={key => {
        const id = key ? String(key) : NO_DEFAULT_ID;
        setDefaultWorkspace(id === NO_DEFAULT_ID ? '' : id);
      }}
    />
  );
}
