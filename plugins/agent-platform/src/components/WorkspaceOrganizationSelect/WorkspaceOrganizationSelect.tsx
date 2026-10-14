import { Select } from '@backstage/ui';

import { useWorkspacesData } from '../WorkspacesDataProvider';

/**
 * The Workspaces tab's Organization scope, beside the Environment control:
 * the Organizations the person is a member of. A person in one Organization
 * never sees it; the tab is that Organization's. Must be mounted inside the
 * plugin's `CustomizeDataProvider`.
 */
export function WorkspaceOrganizationSelect() {
  const { organizations, organization, setOrganization } = useWorkspacesData();
  if (organizations.length <= 1 || !organization) {
    return null;
  }
  return (
    <div style={{ minWidth: 200 }}>
      <Select
        label="Organization"
        options={organizations.map(name => ({ id: name, label: name }))}
        selectedKey={organization}
        onSelectionChange={key => {
          if (key !== null) {
            setOrganization(String(key));
          }
        }}
      />
    </div>
  );
}
