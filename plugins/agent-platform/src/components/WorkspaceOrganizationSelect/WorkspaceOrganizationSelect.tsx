import { Select } from '@backstage/ui';
import { makeStyles } from '@material-ui/core';
import { PHONE_MEDIA } from '@giantswarm/backstage-plugin-ui-react';

import { useWorkspacesData } from '../WorkspacesDataProvider';

const useStyles = makeStyles({
  root: {
    minWidth: 200,
    // On a phone, a long name ends in an ellipsis within the screen: the
    // header's actions size to their content, so a percentage would not
    // hold it. 16px is the shell's phone gutter on each side.
    [PHONE_MEDIA]: {
      maxWidth: 'calc(100vw - 32px)',
    },
  },
});

/**
 * The Workspaces tab's Organization scope, beside the Environment control:
 * the Organizations the person is a member of. A person in one Organization
 * never sees it; the tab is that Organization's. Must be mounted inside the
 * plugin's `CustomizeDataProvider`.
 */
export function WorkspaceOrganizationSelect() {
  const classes = useStyles();
  const { organizations, organization, setOrganization } = useWorkspacesData();
  if (organizations.length <= 1 || !organization) {
    return null;
  }
  return (
    <div className={classes.root}>
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
