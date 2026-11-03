import { useRouteRef } from '@backstage/frontend-plugin-api';
import { ButtonLink } from '@backstage/ui';
import AddIcon from '@material-ui/icons/Add';

import { newWorkspaceRouteRef } from '../../routes';
import { useWorkspacesData } from '../WorkspacesDataProvider';

/**
 * The workspace editor for a new workspace of the Workspaces tab's
 * Organization, on the first installation in scope that runs the
 * workspace-manager. Nothing while there is no Organization to create in.
 * Must be mounted inside a `WorkspacesDataProvider`.
 */
export function CreateWorkspaceButton({
  fullWidth = false,
}: {
  fullWidth?: boolean;
}) {
  const { organization, installations } = useWorkspacesData();
  const newWorkspace = useRouteRef(newWorkspaceRouteRef);
  const installation = installations[0];
  if (!newWorkspace || !organization || !installation) {
    return null;
  }
  const query = new URLSearchParams({ installation, organization });
  return (
    <ButtonLink
      href={`${newWorkspace()}?${query}`}
      variant="primary"
      iconStart={<AddIcon />}
      style={fullWidth ? { width: '100%' } : undefined}
    >
      New workspace
    </ButtonLink>
  );
}
