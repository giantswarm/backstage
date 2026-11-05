import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useRouteRef } from '@backstage/frontend-plugin-api';
import { Flex, Link } from '@backstage/ui';
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
  useMyOrganizations,
  useOrganizationDetails,
} from '../../hooks/useOrganization';
import { agentManagerBlocker } from '../../lib/agentManager';
import type { OrganizationNamespace } from '../../lib/organizations';
import { organizationsRouteRef } from '../../routes';
import { MembersTab } from './MembersTab';
import { ConnectorsTab, EgressTab, ModelsTab } from './ResourceTabs';
import { ORGANIZATION_PAGE_TABS } from './organizationTabs';

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
 * signed-in person. The organization namespace comes from agent-manager's
 * answer for the organization's labels (`list_my_organizations` for a
 * member, `get_organization` for an organizations-admin), never from a name;
 * the title is the display name where `get_organization` answers, else the
 * organization's name.
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
  const mine = useMyOrganizations(blocker ? undefined : installation);
  const details = useOrganizationDetails(installation, parent, name);
  const basePath = useSplatBasePath();
  const { search } = useLocation();

  const membership = mine.data?.organizations.find(
    organization =>
      organization.parent === parent && organization.organization === name,
  );
  const object = details.data?.organization;
  const namespace = membership?.namespace ?? object?.namespace;
  const title = object?.displayName || name;
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
  if (!namespace) {
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
    >
      <Flex direction="column" gap="5">
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
