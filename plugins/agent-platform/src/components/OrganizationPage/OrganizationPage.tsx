import { useEffect, useId, useState } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useRouteRef } from '@backstage/frontend-plugin-api';
import { Alert, Button, Flex, Link } from '@backstage/ui';
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
  isOrganizationReady,
  organizationDeleteMode,
  type OrganizationNamespace,
} from '../../lib/organizations';
import { organizationsRouteRef } from '../../routes';
import { MembersTab } from './MembersTab';
import { ConnectorsTab, EgressTab, ModelsTab } from './ResourceTabs';
import { ORGANIZATION_PAGE_TABS } from './organizationTabs';
import { OrganizationDeleteDialog } from './OrganizationDeleteDialog';
import {
  areChangesOff,
  OrganizationStatusAlert,
} from './OrganizationStatusAlert';

export type OrganizationPageProps = {
  installation: string;
  /** The organization's name. */
  name: string;
};

/** How often the page reads its organization again until it is ready. */
const NOT_READY_POLL_INTERVAL_MS = 10_000;

/** How many reads the page waits for it to be ready: five minutes. */
const NOT_READY_MAX_READS = 30;

/**
 * `next` of the create that opened this page, as the Organizations page's
 * create passes it in the location's state; nothing otherwise.
 */
function createdNextOf(state: unknown): string | undefined {
  if (state && typeof state === 'object' && 'createdNext' in state) {
    const next = (state as { createdNext?: unknown }).createdNext;
    return typeof next === 'string' && next ? next : undefined;
  }
  return undefined;
}

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
  name,
}: OrganizationPageProps) {
  const availability = useAgentManagerAvailability([installation]);
  const blocker = agentManagerBlocker(
    availability.presenceOf(installation),
    installation,
  );
  const mine = useOrganizations(blocker ? undefined : installation);
  const listed = mine.data?.organizations.find(
    organization => organization.name === name,
  );
  const details = useOrganizationDetails(installation, name, {
    enabled: listed?.permissions.manage === true && listed.deleting === true,
  });
  const basePath = useSplatBasePath();
  const { search, state: locationState } = useLocation();
  // What agent-manager said the operator does next, when this page was
  // opened right after the organization was created here.
  const createdNext = createdNextOf(locationState);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  // A delete this page made: an organization without a namespace can be
  // erased before the list is read again, and then is no longer listed.
  const [deletedHere, setDeletedHere] = useState(false);
  const changesOffId = useId();

  // This organization, while the operator has not reported it ready (one
  // created here a moment ago that agent-manager does not list yet among
  // them), is read again, for a few minutes at most: one that stays not
  // ready is read again on the next visit.
  const awaitingReady =
    (Boolean(createdNext) && !listed) ||
    (listed !== undefined && !listed.deleting && !isOrganizationReady(listed));
  const { refetch } = mine;
  useEffect(() => {
    if (!awaitingReady) {
      return undefined;
    }
    let reads = 0;
    const timer = setInterval(() => {
      reads += 1;
      if (reads > NOT_READY_MAX_READS) {
        clearInterval(timer);
        return;
      }
      refetch();
    }, NOT_READY_POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [awaitingReady, refetch]);

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
          description={`${name} on ${installation} is deleted and erased.`}
          actions={backLink}
        />
      </ShellPage>
    );
  }
  // Only a person who manages it deletes it; the mode follows its state.
  // Offered with or without its organization namespace: agent-manager
  // deletes it by its name, and one whose namespace
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
  // On Pending erase and while Erasing every tab keeps its rows and turns its
  // changes off, each control described by the status alert's line that says
  // why.
  const changesDisabledBy =
    status && areChangesOff(status) ? changesOffId : undefined;
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
          changesOffId={changesOffId}
        />
      )}
      {deleteMode && confirmingDelete && (
        <OrganizationDeleteDialog
          installation={installation}
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
    // Listed, or created here a moment ago: agent-manager may list a new
    // organization only on a later read.
    if (listed || (createdNext && !mine.isLoading)) {
      return (
        <ShellPage title={title} {...frame} actions={deleteAction}>
          <Flex direction="column" gap="5">
            {deletion}
            <EmptyStateCard
              title={`${title} is not ready yet`}
              description={[
                `The operator has not created the namespace of ${name} on ${installation} yet. This page shows its members, models and connectors once it has.`,
                object?.ready?.status === 'False' && object.ready.message,
                createdNext &&
                  (createdNext.endsWith('.') ? createdNext : `${createdNext}.`),
              ]
                .filter(Boolean)
                .join(' ')}
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
          description={`${name} on ${installation} is not among the organizations you belong to, or it does not exist. An admin of ${name} can add you.`}
          actions={backLink}
        />
      </ShellPage>
    );
  }

  const organization: OrganizationNamespace = {
    namespace,
    organization: name,
  };
  // The operator created the namespace and reports the organization not
  // ready: its tabs still work, and the reason is said above them.
  const notReady =
    object?.ready?.status === 'False' && !status?.deleting
      ? object.ready
      : undefined;

  return (
    <ShellPage
      title={title}
      {...frame}
      meta={`${namespace} · ${installation}`}
      tabs={ORGANIZATION_PAGE_TABS}
      tabsBasePath={basePath}
      actions={deleteAction}
    >
      <Flex direction="column" gap="5">
        {deletion}
        {notReady && (
          <Alert
            status="info"
            title={`${title} is not ready yet`}
            description={
              notReady.message ??
              notReady.reason ??
              'The operator has not reported it ready.'
            }
          />
        )}
        <Routes>
          <Route
            index
            element={
              <MembersTab
                installation={installation}
                organization={organization}
                listed={listed}
                changesDisabledBy={changesDisabledBy}
              />
            }
          />
          <Route
            path="models"
            element={
              <ModelsTab
                installation={installation}
                organization={organization}
                changesDisabledBy={changesDisabledBy}
              />
            }
          />
          <Route
            path="connectors"
            element={
              <ConnectorsTab
                installation={installation}
                organization={organization}
                changesDisabledBy={changesDisabledBy}
              />
            }
          />
          <Route
            path="egress"
            element={
              <EgressTab
                installation={installation}
                organization={organization}
                changesDisabledBy={changesDisabledBy}
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
