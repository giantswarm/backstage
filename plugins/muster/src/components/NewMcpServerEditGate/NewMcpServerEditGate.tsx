import { useEffect, useMemo, useRef, type ReactNode } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Link } from '@backstage/core-components';
import { useRouteRef } from '@backstage/frontend-plugin-api';
import {
  EmptyStateCard,
  LoadingIndicator,
  WizardFrame,
} from '@giantswarm/backstage-plugin-ui-react';

import {
  editMcpServerAuthRouteRef,
  editMcpServerRouteRef,
  editMcpServerVerifyRouteRef,
  newMcpServerAuthRouteRef,
  newMcpServerRouteRef,
  newMcpServerVerifyRouteRef,
} from '../../routes';
import { isGitOpsManaged } from '../../lib/gitops';
import { wizardEditBlocker } from '../../lib/mcpServerDefinition';
import { connectorDisplayNameOn } from '../../lib/serverGrouping';
import { useMusterInstance } from '../MusterInstanceProvider';
import { useNewMcpServerForm } from '../NewMcpServerFormProvider';
import { useConnectorGroupPaths } from '../shared/hooks';

/** The connector wizard's steps, by the path segment each has. */
export type ConnectorWizardStep = 'connect' | 'auth' | 'verify';

/**
 * A wizard step's address: the registration's (`new[/<step>]`), or, for a
 * run that edits a registered connector, the edit's under the connector's
 * own address (`<installation>/<server>/edit[/<step>]`), so a reload, a
 * shared link or the browser's history lands in the same edit on the same
 * installation. Undefined while the routes are unbound.
 */
export type ConnectorWizardLinks = (
  step: ConnectorWizardStep,
  edited?: { name?: string; installation?: string },
) => string | undefined;

/**
 * The Connectors tab's list — the customer's own connectors, its default
 * sub-tab — where leaving the wizard lands. The wizard is routed under the
 * tab, so the tab's own route always resolves here.
 */
export function useConnectorsListHref(): string {
  const { connectors } = useConnectorGroupPaths();
  if (!connectors) {
    throw new Error('The connector wizard is not mounted under its tab');
  }
  return connectors;
}

export function useConnectorWizardLinks(): ConnectorWizardLinks {
  const newConnect = useRouteRef(newMcpServerRouteRef);
  const newAuth = useRouteRef(newMcpServerAuthRouteRef);
  const newVerify = useRouteRef(newMcpServerVerifyRouteRef);
  const editConnect = useRouteRef(editMcpServerRouteRef);
  const editAuth = useRouteRef(editMcpServerAuthRouteRef);
  const editVerify = useRouteRef(editMcpServerVerifyRouteRef);
  return useMemo(() => {
    const registration = {
      connect: newConnect,
      auth: newAuth,
      verify: newVerify,
    };
    const edit = { connect: editConnect, auth: editAuth, verify: editVerify };
    return (step, edited) => {
      if (edited?.name && edited.installation) {
        return edit[step]?.({
          installation: edited.installation,
          server: edited.name,
        });
      }
      return registration[step]?.();
    };
  }, [newConnect, newAuth, newVerify, editConnect, editAuth, editVerify]);
}

/**
 * Keeps the wizard's edit state and the address in agreement, around every
 * wizard step. The address is the source of truth for *which* server is
 * edited (`<installation>/<server>/edit[/<step>]`); the form provider holds
 * the edit itself.
 *
 * - An edit address and the provider not editing that server on its
 *   installation: seed it from that installation's server list (a progress
 *   indicator while that loads, an empty state when there is no such server
 *   or the wizard cannot edit it). The muster providers are pinned to the
 *   address's installation (`MusterSubPage`), so where it runs no muster the
 *   section can show, an empty state says so.
 * - An edit address for a GitOps-managed server: Git owns it, so the wizard
 *   is never offered (an empty state points back to the list, whose
 *   Edit/Remove leads to its source) — not even through a typed or shared
 *   link.
 * - A registration address while the provider is editing: the edit is over
 *   (the browser's back button, a bookmarked "new" link), so it is reset —
 *   which brings back an unfinished registration the edit set aside. Except
 *   after this run has saved the server: a registration's earlier steps are
 *   registration addresses, so the browser's Back from verify lands on them,
 *   and the run continues as an edit of the server it just created (sent to
 *   the same step's edit address) instead of emptying the form into a
 *   registration that would fail with "already exists".
 * - The header's installation switching mid-registration after a save: the
 *   server lives on the installation it was saved on, so the edit ends and
 *   the user is sent back to the server list, rather than an update silently
 *   targeting another installation.
 *
 * Its own states (reading, not found, blocked) render in the shell's wizard
 * frame with the shell's empty-state card, named like the edit frame they
 * stand in for, so the title does not shift when the wizard takes over.
 */
export function NewMcpServerEditGate({
  step,
  children,
}: {
  /** The step this gate stands around. */
  step: ConnectorWizardStep;
  children: ReactNode;
}) {
  const navigate = useNavigate();
  const wizardLinks = useConnectorWizardLinks();
  const connectorsHref = useConnectorsListHref();
  // Set on the edit addresses only.
  const { server: editName, installation: editInstallation } = useParams();
  const { activeInstallation, mcpServers, isLoading, isLoadingInstallations } =
    useMusterInstance();
  // The address names an installation the section cannot show (muted, or
  // running no muster): the providers, pinned to it, resolved none.
  const elsewhere =
    Boolean(editName) &&
    !isLoadingInstallations &&
    editInstallation !== activeInstallation;
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
      navigate(connectorsHref);
      return;
    }
    if (inSync) {
      return;
    }
    if (resumeSaved && registeredName) {
      const resumed = wizardLinks(step, {
        name: registeredName,
        installation: registeredInstallation,
      });
      if (resumed) {
        navigate(resumed, { replace: true });
      }
    } else if (!editName) {
      reset();
    } else if (server && !blocker && !gitOpsManaged) {
      startEdit(server);
    }
  }, [
    activeInstallation,
    registeredName,
    registeredInstallation,
    inSync,
    resumeSaved,
    editName,
    server,
    gitOpsManaged,
    blocker,
    reset,
    startEdit,
    connectorsHref,
    navigate,
    wizardLinks,
    step,
  ]);

  if (inSync) {
    return <>{children}</>;
  }

  const backToServers = <Link to={connectorsHref}>Back to connectors</Link>;

  let body: ReactNode;
  if (elsewhere) {
    body = (
      <EmptyStateCard
        title="Environment not available"
        description={`The link edits "${editName}" on ${editInstallation}, but connectors on ${editInstallation} cannot be read here. It may be turned off under Cluster access, or run no muster.`}
        actions={backToServers}
      />
    );
  } else if (editName && !server && !isLoading && !isLoadingInstallations) {
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
      closeHref={connectorsHref}
    >
      {body}
    </WizardFrame>
  );
}
