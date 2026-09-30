import { useEffect, useRef, type ReactNode } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Content,
  EmptyState,
  Link,
  Progress,
} from '@backstage/core-components';
import { useRouteRef } from '@backstage/frontend-plugin-api';

import { mcpServersRouteRef } from '../../routes';
import { isGitOpsManaged } from '../../lib/gitops';
import { wizardEditBlocker } from '../../lib/mcpServerDefinition';
import { useMusterInstance } from '../MusterInstanceProvider';
import { useNewMcpServerForm } from '../NewMcpServerFormProvider';

/** The query parameter naming the server a wizard run edits. */
export const EDIT_PARAM = 'edit';

/**
 * A wizard step's path, carrying the server the run edits (if any) so a
 * reload, a shared link or the browser's history lands in the same edit.
 */
export function withEditParam(path: string, name: string | undefined): string {
  return name ? `${path}?${EDIT_PARAM}=${encodeURIComponent(name)}` : path;
}

/**
 * Keeps the wizard's edit state and the URL in agreement, around every wizard
 * step. The URL is the source of truth for *which* server is edited
 * (`?edit=<name>`); the form provider holds the edit itself.
 *
 * - `?edit=<name>` and the provider not editing that server on the active
 *   installation: seed it from the active installation's server list
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
 */
export function NewMcpServerEditGate({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const serversLink = useRouteRef(mcpServersRouteRef);
  const [searchParams] = useSearchParams();
  const editName = searchParams.get(EDIT_PARAM) ?? undefined;
  const { activeInstallation, mcpServers, isLoading, isLoadingInstallations } =
    useMusterInstance();
  const { registeredName, registeredInstallation, lastSave, startEdit, reset } =
    useNewMcpServerForm();

  const server = editName
    ? mcpServers.find(
        s => s.getName() === editName && s.cluster === activeInstallation,
      )
    : undefined;
  const gitOpsManaged = server ? isGitOpsManaged(server) : false;
  const inSync =
    !gitOpsManaged &&
    (editName
      ? registeredName === editName &&
        registeredInstallation === activeInstallation
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

  const backToServers = serversLink ? (
    <Link to={serversLink()}>Back to MCP servers</Link>
  ) : undefined;

  if (editName && !server && !isLoading && !isLoadingInstallations) {
    return (
      <Content>
        <EmptyState
          missing="data"
          title="Server not found"
          description={`There is no MCP server "${editName}" on ${
            activeInstallation ?? 'this installation'
          }.`}
          action={backToServers}
        />
      </Content>
    );
  }
  if (gitOpsManaged) {
    return (
      <Content>
        <EmptyState
          missing="info"
          title="This server is managed in Git"
          description={`"${editName}" is applied from a GitOps repository, so changes are made there, not in the portal. Its Edit/Remove on the server list links to its source.`}
          action={backToServers}
        />
      </Content>
    );
  }
  if (blocker) {
    return (
      <Content>
        <EmptyState
          missing="info"
          title="This server cannot be edited in the wizard"
          description={blocker}
          action={backToServers}
        />
      </Content>
    );
  }
  // Seeding (or resetting) takes one render; the steps must not render in
  // between, or their guards would redirect on a half-seeded form.
  return <Progress aria-label="Loading the server" />;
}
