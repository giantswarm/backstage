import { useRouteRef } from '@backstage/frontend-plugin-api';
import { Alert, Flex, Link, List, ListRow, Text } from '@backstage/ui';
import {
  countNoun,
  EmptyStateCard,
  PageSection,
  ShellPage,
  ShellPageFactsSkeleton,
} from '@giantswarm/backstage-plugin-ui-react';

import { organizationDetailRouteRef } from '../../routes';
import {
  useOrganizationDirectory,
  type UncheckedInstallation,
} from '../OrganizationDirectoryProvider';
import {
  UncheckedInstallations,
  useConnectorsHref,
} from './UncheckedInstallations';

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
    listingError,
    uncheckedInstallations,
    noneChecked,
    organizationsOf,
    failureOf,
    recheck,
    isLoading,
  } = useOrganizationDirectory();
  const detailRoute = useRouteRef(organizationDetailRouteRef);
  const frame = { documentTitle: 'Organizations' };

  // The installations whose check failed sit behind one quiet line, under
  // what could be read: an installation the person never uses must not
  // stack a warning above their organizations.
  const unchecked = (
    <UncheckedInstallations
      unchecked={uncheckedInstallations}
      recheck={recheck}
    />
  );

  const servesNowhere = installations.length === 0;
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
      {/* One tree for every state: the disclosure keeps whether it is open
          as installations answer. */}
      <Flex direction="column" gap="5">
        {listingError && (
          <Alert
            status="warning"
            title="Could not read the installations"
            description={listingError}
          />
        )}
        {servesNowhere && !listingError && noneChecked && (
          <NoneCheckedAlert unchecked={uncheckedInstallations} />
        )}
        {servesNowhere && isLoading && <ShellPageFactsSkeleton />}
        {servesNowhere && !isLoading && !listingError && !noneChecked && (
          <EmptyStateCard
            title="Organizations are not available here"
            description={
              uncheckedInstallations.length === 0
                ? "No environment's agent-manager serves organizations to this portal yet."
                : 'No installation that answered serves organizations to this portal. The ones that could not be checked are listed below.'
            }
          />
        )}
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
        {unchecked}
      </Flex>
    </ShellPage>
  );
}

/**
 * Not one installation could be checked, so the page has nothing else to
 * show: one warning, saying where a sign-in would help when one would.
 */
function NoneCheckedAlert({
  unchecked,
}: {
  unchecked: UncheckedInstallation[];
}) {
  const connectorsHref = useConnectorsHref(
    unchecked.length === 1 ? unchecked[0].installation : undefined,
  );
  const musterSignIn = unchecked.some(entry => entry.reason === 'musterSignIn');
  const connectorSignIn = unchecked.some(
    entry => entry.reason === 'connectorSignIn',
  );
  const where =
    unchecked.length === 1
      ? unchecked[0].installation
      : `any of ${countNoun(unchecked.length, 'installation')}`;
  return (
    <Alert
      status="warning"
      title="Could not check any installation for organizations"
      description={
        <Flex direction="column" gap="2">
          <Text variant="body-small">
            The portal could not check {where} for organizations.
            {musterSignIn &&
              ' Sign in to Muster for the installation you use on the Connectors page, then check it again in the list below.'}
            {!musterSignIn &&
              connectorSignIn &&
              ' Sign in to the agent-manager connector of the installation you use in the list below.'}
            {!musterSignIn &&
              !connectorSignIn &&
              ' The list below says why for each one.'}
          </Text>
          {musterSignIn && connectorsHref && (
            <Link href={connectorsHref} variant="body-small">
              Open Connectors
            </Link>
          )}
        </Flex>
      }
    />
  );
}
