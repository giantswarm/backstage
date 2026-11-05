import { useRouteRef } from '@backstage/frontend-plugin-api';
import { Alert, Flex, List, ListRow } from '@backstage/ui';
import {
  EmptyStateCard,
  PageSection,
  ShellPage,
  ShellPageFactsSkeleton,
} from '@giantswarm/backstage-plugin-ui-react';

import { organizationDetailRouteRef } from '../../routes';
import { useOrganizationDirectory } from '../OrganizationDirectoryProvider';

/**
 * Who can add a person to an organization, when agent-manager's answer does
 * not say it (`list_my_organizations`' `none`).
 */
const NO_ORGANIZATION_HINT =
  'An admin of an organization adds you, or someone with the agent-platform:organizations-admin role creates one with you as its first admin.';

/** `text` with its first letter capitalized, as a sentence starts. */
function sentence(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/**
 * The organizations the signed-in person belongs to, on every installation
 * whose agent-manager serves the organization tools: the place everyone uses
 * agents through. A person in none is told who can add them, in
 * agent-manager's words.
 */
export function OrganizationsIndexPage() {
  const { installations, organizationsOf, failureOf, isLoading } =
    useOrganizationDirectory();
  const detailRoute = useRouteRef(organizationDetailRouteRef);
  const frame = { documentTitle: 'Organizations' };

  if (installations.length === 0) {
    return (
      <ShellPage title="Organizations" {...frame}>
        {isLoading ? (
          <ShellPageFactsSkeleton />
        ) : (
          <EmptyStateCard
            title="Organizations are not available here"
            description="No environment's agent-manager serves organizations to this portal yet."
          />
        )}
      </ShellPage>
    );
  }

  const answered = installations.filter(installation =>
    Boolean(organizationsOf(installation)),
  );
  const belongsNowhere =
    !isLoading &&
    answered.length > 0 &&
    answered.every(
      installation =>
        (organizationsOf(installation)?.organizations.length ?? 0) === 0,
    );
  const none = answered
    .map(installation => organizationsOf(installation)?.none)
    .find(Boolean);

  return (
    <ShellPage title="Organizations" {...frame}>
      <Flex direction="column" gap="5">
        {belongsNowhere && (
          <EmptyStateCard
            title="You belong to no organization"
            description={sentence(none ?? NO_ORGANIZATION_HINT)}
          />
        )}
        {installations.map(installation => {
          const answer = organizationsOf(installation);
          const failure = failureOf(installation);
          if (failure) {
            return (
              <PageSection key={installation} title={installation}>
                <Alert
                  status="warning"
                  title={`Could not read your organizations on ${installation}`}
                  description={failure}
                />
              </PageSection>
            );
          }
          if (!answer || answer.organizations.length === 0) {
            return null;
          }
          return (
            <PageSection key={installation} title={installation}>
              <List aria-label={`Your organizations on ${installation}`}>
                {answer.organizations.map(organization => {
                  const href = detailRoute?.({
                    installation,
                    parent: organization.parent,
                    name: organization.organization,
                  });
                  return (
                    <ListRow
                      key={organization.namespace}
                      id={organization.namespace}
                      href={href}
                      textValue={organization.organization}
                      description={`${organization.parent} · ${organization.namespace}`}
                    >
                      {organization.organization}
                    </ListRow>
                  );
                })}
              </List>
            </PageSection>
          );
        })}
      </Flex>
    </ShellPage>
  );
}
