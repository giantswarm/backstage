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
 * not say it (`list_organizations`' `none`).
 */
const NO_ORGANIZATION_HINT =
  'An admin of an organization adds you, or someone with the agent-platform:organizations-admin role creates one with you as its first admin.';

/** `text` with its first letter capitalized, as a sentence starts. */
function sentence(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/**
 * The organizations the signed-in person manages or belongs to, on every
 * installation whose agent-manager serves the organization tools: the place
 * everyone uses agents through. A person in none is told who can add them,
 * in agent-manager's words.
 */
export function OrganizationsIndexPage() {
  const {
    installations,
    discoveryErrors,
    organizationsOf,
    failureOf,
    isLoading,
  } = useOrganizationDirectory();
  const detailRoute = useRouteRef(organizationDetailRouteRef);
  const frame = { documentTitle: 'Organizations' };

  const discoveryAlerts = discoveryErrors.map(message => (
    <Alert
      key={message}
      status="warning"
      title="Could not check organization availability"
      description={message}
    />
  ));

  if (installations.length === 0) {
    return (
      <ShellPage title="Organizations" {...frame}>
        <Flex direction="column" gap="5">
          {discoveryAlerts}
          {isLoading && <ShellPageFactsSkeleton />}
          {!isLoading && discoveryErrors.length === 0 && (
            <EmptyStateCard
              title="Organizations are not available here"
              description="No environment's agent-manager serves organizations to this portal yet."
            />
          )}
        </Flex>
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
        {discoveryAlerts}
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
                  const id = `${organization.parent}/${organization.name}`;
                  const href = detailRoute?.({
                    installation,
                    parent: organization.parent,
                    name: organization.name,
                  });
                  const label = organization.displayName || organization.name;
                  return (
                    <ListRow
                      key={id}
                      id={id}
                      href={href}
                      textValue={label}
                      description={[
                        organization.parent,
                        organization.namespace,
                        organization.permissions.manage
                          ? 'you manage it'
                          : undefined,
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    >
                      {label}
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
