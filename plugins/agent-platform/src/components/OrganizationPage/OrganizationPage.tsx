import { useState } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useRouteRef } from '@backstage/frontend-plugin-api';
import { Button, Flex, Link } from '@backstage/ui';
import {
  type BreadcrumbItem,
  EmptyStateCard,
  ShellPage,
  ShellPageFactsSkeleton,
  ShellPageTitleSkeleton,
  useSplatBasePath,
} from '@giantswarm/backstage-plugin-ui-react';

import { useAgentManagerAvailability } from '../../hooks/useAgentManager';
import {
  useOrganizationDetails,
  useOrganizations,
} from '../../hooks/useOrganization';
import { agentManagerBlocker } from '../../lib/agentManager';
import {
  organizationDeleteMode,
  type OrganizationNamespace,
} from '../../lib/organizations';
import { organizationsRouteRef } from '../../routes';
import { MembersTab } from './MembersTab';
import { ConnectorsTab, EgressTab, ModelsTab } from './ResourceTabs';
import { ORGANIZATION_PAGE_TABS } from './organizationTabs';
import { OrganizationDeleteDialog } from './OrganizationDeleteDialog';
import { OrganizationStatusAlert } from './OrganizationStatusAlert';

export type OrganizationPageProps = {
  installation: string;
  /** The parent namespace the organization lives in. */
  parent: string;
  /** The organization's name. */
  name: string;
};

function useOrganizationFrame(title: string) {
  const organizationsLink = useRouteRef(organizationsRouteRef);
  const listHref = organizationsLink?.();
  const breadcrumbs: BreadcrumbItem[] = [
    { label: 'Organizations', href: listHref },
    { label: title },
  ];
  return {
    listHref,
    frame: { breadcrumbs, documentTitle: [title, 'Organizations'] },
  };
}

/**
 * One Agent Platform organization: its Members, Models, Connectors and
 * Egress, each a tab read from agent-manager's organization tools as the
 * signed-in person. The organization and its namespace come from
 * `list_organizations`, never from a name: a member who does not manage it
 * gets its status only, one who manages it its summary too.
 * `get_organization`, which also previews the erasure, is asked only to
 * follow the erasure of an organization the person manages.
 */
export function OrganizationPage({
  installation,
  parent,
  name,
}: OrganizationPageProps) {
  const availability = useAgentManagerAvailability([installation]);
  const blocker = agentManagerBlocker(
    availability.presenceOf(installation),
    installation,
  );
  const mine = useOrganizations(blocker ? undefined : installation);
  const listed = mine.data?.organizations.find(
    organization =>
      organization.parent === parent && organization.name === name,
  );
  const details = useOrganizationDetails(installation, parent, name, {
    enabled: listed?.permissions.manage === true && listed.deleting === true,
  });
  const basePath = useSplatBasePath();
  const { search } = useLocation();
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  // A delete this page made: an organization without a namespace can be
  // erased before the list is read again, and then is no longer listed.
  const [deletedHere, setDeletedHere] = useState(false);

  const object = details.data?.organization ?? listed?.organization;
  const status = object ?? listed;
  const namespace = listed?.namespace ?? object?.namespace;
  const title = object?.displayName || listed?.displayName || name;
  const { listHref, frame } = useOrganizationFrame(title);
  const backLink = listHref ? (
    <Link href={listHref}>Back to organizations</Link>
  ) : undefined;

  if (blocker) {
    return (
      <ShellPage title={name} {...frame}>
        <EmptyStateCard
          title="Organizations are not available here"
          description={blocker}
          actions={backLink}
        />
      </ShellPage>
    );
  }
  if (mine.supported === undefined && mine.infoError) {
    return (
      <ShellPage title={name} {...frame}>
        <EmptyStateCard
          title={`Could not read agent-manager on ${installation}`}
          description={mine.infoError.message}
          actions={
            <Flex gap="3" align="center">
              <Button variant="secondary" onPress={() => mine.recheck()}>
                Check again
              </Button>
              {backLink}
            </Flex>
          }
        />
      </ShellPage>
    );
  }
  if (mine.supported === false) {
    return (
      <ShellPage title={name} {...frame}>
        <EmptyStateCard
          title="Organizations are not available here"
          description={`agent-manager on ${installation} does not serve the organization tools yet.`}
          actions={backLink}
        />
      </ShellPage>
    );
  }
  // The read keeps the last organization it had; `not_found` after one that
  // was deleting is the end of its erasure.
  if (
    (object?.deleting && details.failure?.code === 'not_found') ||
    (deletedHere && !listed && !mine.isLoading)
  ) {
    return (
      <ShellPage title={title} {...frame}>
        <EmptyStateCard
          title={`${title} is erased`}
          description={`${name} in ${parent} on ${installation} is deleted and erased.`}
          actions={backLink}
        />
      </ShellPage>
    );
  }
  // Only a person who manages it deletes it; the mode follows its state.
  // Offered with or without its organization namespace: agent-manager
  // deletes it by its parent namespace and name, and one whose namespace
  // the operator never created is still to be removed.
  const deleteMode =
    listed?.permissions.manage && object
      ? organizationDeleteMode(object)
      : undefined;
  const deleteAction =
    deleteMode === 'delete' || deleteMode === 'pull-request' ? (
      <Button variant="secondary" onPress={() => setConfirmingDelete(true)}>
        Delete organization
      </Button>
    ) : undefined;
  // Its state (Pending erase with Erase now, Missing from git) and the
  // delete dialog, above whichever body the page shows.
  const deletion = (
    <>
      {status && (
        <OrganizationStatusAlert
          organization={status}
          onEraseNow={
            deleteMode === 'erase' ? () => setConfirmingDelete(true) : undefined
          }
        />
      )}
      {deleteMode && confirmingDelete && (
        <OrganizationDeleteDialog
          installation={installation}
          parent={parent}
          name={name}
          title={title}
          mode={deleteMode}
          isOpen
          onOpenChange={setConfirmingDelete}
          onDeleted={() => setDeletedHere(true)}
        />
      )}
    </>
  );

  if (!namespace) {
    if (mine.failure) {
      return (
        <ShellPage title={name} {...frame}>
          <EmptyStateCard
            title={`Could not read your organizations on ${installation}`}
            description={mine.failure.message}
            actions={
              <Flex gap="3" align="center">
                <Button variant="secondary" onPress={() => mine.refetch()}>
                  Check again
                </Button>
                {backLink}
              </Flex>
            }
          />
        </ShellPage>
      );
    }
    if (listed) {
      return (
        <ShellPage title={title} {...frame} actions={deleteAction}>
          <Flex direction="column" gap="5">
            {deletion}
            <EmptyStateCard
              title={`${title} has no namespace yet`}
              description={`agent-manager lists ${name} in ${parent} on ${installation}, and the operator has not created its organization namespace yet.`}
              actions={backLink}
            />
          </Flex>
        </ShellPage>
      );
    }
    if (mine.isLoading || details.isLoading || mine.supported === undefined) {
      return (
        <ShellPage
          title={<ShellPageTitleSkeleton label={`Reading ${name}…`} />}
          {...frame}
        >
          <ShellPageFactsSkeleton />
        </ShellPage>
      );
    }
    return (
      <ShellPage title={name} {...frame}>
        <EmptyStateCard
          title={`You are not a member of ${name}`}
          description={`${name} in ${parent} on ${installation} is not among the organizations you belong to, or it does not exist. An admin of ${name} can add you.`}
          actions={backLink}
        />
      </ShellPage>
    );
  }

  const organization: OrganizationNamespace = {
    namespace,
    organization: name,
    parent,
  };

  return (
    <ShellPage
      title={title}
      {...frame}
      meta={`${namespace} · ${parent} · ${installation}`}
      tabs={ORGANIZATION_PAGE_TABS}
      tabsBasePath={basePath}
      actions={deleteAction}
    >
      <Flex direction="column" gap="5">
        {deletion}
        <Routes>
          <Route
            index
            element={
              <MembersTab installation={installation} namespace={namespace} />
            }
          />
          <Route
            path="models"
            element={
              <ModelsTab
                installation={installation}
                organization={organization}
              />
            }
          />
          <Route
            path="connectors"
            element={
              <ConnectorsTab
                installation={installation}
                organization={organization}
              />
            }
          />
          <Route
            path="egress"
            element={
              <EgressTab
                installation={installation}
                organization={organization}
              />
            }
          />
          {/* An address the page does not have lands on Members. */}
          <Route
            path="*"
            element={<Navigate to={`${basePath}${search}`} replace />}
          />
        </Routes>
      </Flex>
    </ShellPage>
  );
}
