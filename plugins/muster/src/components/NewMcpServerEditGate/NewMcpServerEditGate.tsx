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
 * - No `?edit` while the provider is editing: the edit is over (the browser's
 *   back button, a bookmarked "new" link), so it is reset — which brings back
 *   an unfinished registration the edit set aside.
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
  const { registeredName, registeredInstallation, startEdit, reset } =
    useNewMcpServerForm();

  const inSync = editName
    ? registeredName === editName &&
      registeredInstallation === activeInstallation
    : !registeredName;
  const server = editName
    ? mcpServers.find(
        s => s.getName() === editName && s.cluster === activeInstallation,
      )
    : undefined;
  const blocker = server ? wizardEditBlocker(server) : undefined;

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
    if (!editName) {
      reset();
    } else if (server && !blocker) {
      startEdit(server);
    }
  }, [
    activeInstallation,
    registeredName,
    inSync,
    editName,
    server,
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
