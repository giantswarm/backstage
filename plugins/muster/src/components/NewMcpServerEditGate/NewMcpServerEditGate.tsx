import { useEffect, useRef, type ReactNode } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Link } from '@backstage/core-components';
import { useRouteRef } from '@backstage/frontend-plugin-api';
import {
  EmptyStateCard,
  LoadingIndicator,
  WizardFrame,
} from '@giantswarm/backstage-plugin-ui-react';

import { customizeExternalRouteRef, mcpServersRouteRef } from '../../routes';
import { isGitOpsManaged } from '../../lib/gitops';
import { wizardEditBlocker } from '../../lib/mcpServerDefinition';
import { connectorDisplayNameOn } from '../../lib/serverGrouping';
import { useMusterInstance } from '../MusterInstanceProvider';
import { useNewMcpServerForm } from '../NewMcpServerFormProvider';

/** The query parameter naming the server a wizard run edits. */
export const EDIT_PARAM = 'edit';

/** The query parameter naming the installation the edited server is on. */
const INSTALLATION_PARAM = 'installation';

/**
 * A wizard step's path, carrying the server the run edits (if any) so a
 * reload, a shared link or the browser's history lands in the same edit.
 * The link that starts an edit names the server's installation too; the
 * steps after it leave it out, since the edit then holds it.
 */
export function withEditParam(
  path: string,
  name: string | undefined,
  installation?: string,
): string {
  if (!name) {
    return path;
  }
  const edit = `${path}?${EDIT_PARAM}=${encodeURIComponent(name)}`;
  return installation
    ? `${edit}&${INSTALLATION_PARAM}=${encodeURIComponent(installation)}`
    : edit;
}

/**
 * Keeps the wizard's edit state and the URL in agreement, around every wizard
 * step. The URL is the source of truth for *which* server is edited
 * (`?edit=<name>`); the form provider holds the edit itself.
 *
 * - `?edit=<name>` and the provider not editing that server on its
 *   installation (`?installation=`, else the active one): seed it from the
 *   active installation's server list
 *   (a progress indicator while that loads, an empty state when there is no
 *   such server or the wizard cannot edit it).
 * - `?edit=<name>` for a GitOps-managed server: Git owns it, so the wizard is
 *   never offered (an empty state points back to the list, whose Edit/Remove
 *   leads to its source) — not even through a typed or shared link.
 * - No `?edit` while the provider is editing: the edit is over (the browser's
 *   back button, a bookmarked "new" link), so it is reset — which brings back
 *   an unfinished registration the edit set aside. Except after this run has
 *   saved the server: a registration's earlier steps carry no `?edit`, so Back
 *   from verify lands on them without it, and the run continues as an edit of
 *   the server it just created (the param is put back) instead of emptying the
 *   form into a registration that would fail with "already exists".
 * - The header's installation switching mid-edit: the server lives on the
 *   installation it was opened on, so the edit ends and the user is sent back
 *   to the server list, rather than an update silently targeting another
 *   installation.
 *
 * Its own states (reading, not found, blocked) render in the shell's wizard
 * frame with the shell's empty-state card, named like the edit frame they
 * stand in for, so the title does not shift when the wizard takes over.
 */
export function NewMcpServerEditGate({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const serversLink = useRouteRef(mcpServersRouteRef);
  const customizeRoute = useRouteRef(customizeExternalRouteRef);
  const [searchParams] = useSearchParams();
  const editName = searchParams.get(EDIT_PARAM) ?? undefined;
  const { activeInstallation, mcpServers, isLoading, isLoadingInstallations } =
    useMusterInstance();
  // The installation the edited server is on: the one the Edit link names,
  // else the active one.
  const editInstallation =
    searchParams.get(INSTALLATION_PARAM) ?? activeInstallation;
  const { registeredName, registeredInstallation, lastSave, startEdit, reset } =
    useNewMcpServerForm();

  const server = editName
    ? mcpServers.find(
        s => s.getName() === editName && s.cluster === editInstallation,
      )
    : undefined;
  const gitOpsManaged = server ? isGitOpsManaged(server) : false;
  // What people call the connector; the URL keeps its resource name.
  const shownName = editName
    ? connectorDisplayNameOn(mcpServers, editInstallation, editName)
    : undefined;
  const inSync =
    !gitOpsManaged &&
    (editName
      ? registeredName === editName &&
        registeredInstallation === editInstallation
      : !registeredName);
  const blocker =
    server && !gitOpsManaged ? wizardEditBlocker(server) : undefined;
  // Saved by this run and the param lost (Back from verify after a create).
  const resumeSaved = !editName && Boolean(registeredName && lastSave);

  // One effect, in priority order: an installation switch ends the edit
  // before anything could re-seed it from the newly selected installation.
  const previousInstallation = useRef(activeInstallation);
  useEffect(() => {
    const switched =
      previousInstallation.current !== undefined &&
      previousInstallation.current !== activeInstallation;
    previousInstallation.current = activeInstallation;
    if (switched && registeredName) {
      reset();
      if (serversLink) {
        navigate(serversLink());
      }
      return;
    }
    if (inSync) {
      return;
    }
    if (resumeSaved && registeredName) {
      navigate(
        { search: `?${EDIT_PARAM}=${encodeURIComponent(registeredName)}` },
        { replace: true },
      );
    } else if (!editName) {
      reset();
    } else if (server && !blocker && !gitOpsManaged) {
      startEdit(server);
    }
  }, [
    activeInstallation,
    registeredName,
    inSync,
    resumeSaved,
    editName,
    server,
    gitOpsManaged,
    blocker,
    reset,
    startEdit,
    serversLink,
    navigate,
  ]);

  if (inSync) {
    return <>{children}</>;
  }

  const connectorsHref = customizeRoute
    ? `${customizeRoute()}/connectors`
    : serversLink?.();
  const backToServers = connectorsHref ? (
    <Link to={connectorsHref}>Back to connectors</Link>
  ) : undefined;

  let body: ReactNode;
  if (editName && !server && !isLoading && !isLoadingInstallations) {
    body = (
      <EmptyStateCard
        title="Connector not found"
        description={`There is no connector "${editName}" on ${
          editInstallation ?? 'this environment'
        }.`}
        actions={backToServers}
      />
    );
  } else if (gitOpsManaged) {
    body = (
      <EmptyStateCard
        title="This connector is managed in Git"
        description={`"${shownName}" is applied from a GitOps repository, so changes are made there, not in the portal. Its Edit/Remove on the connector list links to its source.`}
        actions={backToServers}
      />
    );
  } else if (blocker) {
    body = (
      <EmptyStateCard
        title="This connector cannot be edited in the wizard"
        description={blocker}
        actions={backToServers}
      />
    );
  } else {
    // Seeding (or resetting) takes one render; the steps must not render in
    // between, or their guards would redirect on a half-seeded form.
    body = <LoadingIndicator label="Reading the connector…" />;
  }

  return (
    <WizardFrame
      title={editName ? 'Edit connector' : 'Add connector'}
      documentTitle={
        shownName ? [`Edit ${shownName}`, 'Connectors'] : undefined
      }
      context={
        shownName
          ? `Customize / Connectors / ${shownName}`
          : 'Customize / Connectors'
      }
      closeHref={connectorsHref ?? '/'}
    >
      {body}
    </WizardFrame>
  );
}
