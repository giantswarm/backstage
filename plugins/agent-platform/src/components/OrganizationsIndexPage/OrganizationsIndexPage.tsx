import { useCallback, useEffect, useState } from 'react';
import { useRouteRef } from '@backstage/frontend-plugin-api';
import { Alert, Button, Flex, Link, List, ListRow, Text } from '@backstage/ui';
import {
  countNoun,
  EmptyStateCard,
  joinNames,
  PageSection,
  ShellPage,
  ShellPageFactsSkeleton,
  usePhoneLayout,
} from '@giantswarm/backstage-plugin-ui-react';
// eslint-disable-next-line @backstage/no-mixed-plugin-imports -- muster names the connector.
import { useConnectorLabel } from '@giantswarm/backstage-plugin-muster';
import { useSelfSubjectAccessReview } from '@giantswarm/backstage-plugin-kubernetes-react';

import { AGENT_MANAGER_SERVER } from '../../lib/agentManager';
import { isOrganizationReady } from '../../lib/organizations';
import { CreateOrganizationDialog } from '../CreateOrganizationDialog';
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

/**
 * On a desktop, bui's `truncate`, held to the label's width: the Link is an
 * inline block, which otherwise grows past it with a long name. As
 * AgentUsageList's rows.
 */
const NAME_ONE_LINE = { maxWidth: '100%' } as const;

/**
 * At phone width the name wraps to two lines, then an ellipsis: a phone has
 * no hover to read the rest. As AgentUsageList's rows.
 */
const NAME_TWO_LINES = {
  minWidth: 0,
  maxWidth: '100%',
  overflowWrap: 'anywhere',
  display: '-webkit-box',
  WebkitLineClamp: 2,
  WebkitBoxOrient: 'vertical',
  overflow: 'hidden',
  whiteSpace: 'normal',
} as const;

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
    turnedOffInstallations,
    organizationsOf,
    recheck,
    isLoading,
  } = useOrganizationDirectory();
  const detailRoute = useRouteRef(organizationDetailRouteRef);
  const isPhone = usePhoneLayout();
  const frame = { documentTitle: 'Organizations' };
  const [creatable, setCreatable] = useState<Record<string, boolean>>({});
  const [creating, setCreating] = useState(false);
  const onCreateAccess = useCallback(
    (installation: string, allowed: boolean) =>
      setCreatable(current =>
        current[installation] === allowed
          ? current
          : { ...current, [installation]: allowed },
      ),
    [],
  );

  // The installations whose check failed sit behind one quiet line, under
  // what could be read: an installation the person never uses must not
  // stack a warning above their organizations.
  const unchecked = (
    <UncheckedInstallations
      unchecked={uncheckedInstallations}
      recheck={recheck}
    />
  );

  // An installation whose check failed is shown once, in the disclosure:
  // never also as a section of its own, a stale answer included.
  const failed = new Set(
    uncheckedInstallations.map(entry => entry.installation),
  );
  const answered = installations.filter(
    installation =>
      !failed.has(installation) && Boolean(organizationsOf(installation)),
  );
  const nothingAnswered = answered.length === 0;
  const belongsNowhere =
    !isLoading &&
    !nothingAnswered &&
    answered.every(
      installation =>
        (organizationsOf(installation)?.organizations.length ?? 0) === 0,
    );
  const none = answered
    .map(installation => organizationsOf(installation)?.none)
    .find(Boolean);
  // Where the person may create an `Organization`: only an installation
  // whose organizations could be read is offered.
  const createOn = answered.filter(installation => creatable[installation]);

  return (
    <ShellPage
      title="Organizations"
      {...frame}
      actions={
        createOn.length > 0 ? (
          <Button variant="primary" onPress={() => setCreating(true)}>
            Create organization
          </Button>
        ) : undefined
      }
    >
      {answered.map(installation => (
        <CreateAccessProbe
          key={installation}
          installation={installation}
          onAnswer={onCreateAccess}
        />
      ))}
      <CreateOrganizationDialog
        installations={createOn}
        isOpen={creating && createOn.length > 0}
        onOpenChange={setCreating}
      />
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
        {!listingError && noneChecked && (
          <NoneCheckedAlert unchecked={uncheckedInstallations} />
        )}
        {nothingAnswered && isLoading && <ShellPageFactsSkeleton />}
        {nothingAnswered &&
          !isLoading &&
          !listingError &&
          !noneChecked &&
          installations.length > 0 && (
            // An installation serves organizations, and the read of them
            // failed: not "not available". Where, and why, is in the list.
            <EmptyStateCard
              title="Your organizations could not be read"
              description="An installation serves organizations, but the portal could not read yours there. The list below says why, and what helps."
            />
          )}
        {nothingAnswered &&
          !isLoading &&
          !listingError &&
          !noneChecked &&
          installations.length === 0 && (
            <EmptyStateCard
              title="Organizations are not available here"
              description={[
                uncheckedInstallations.length === 0
                  ? "No environment's agent-manager serves organizations to this portal yet."
                  : 'No installation that answered serves organizations to this portal. The ones that could not be checked are listed below.',
                // Named nowhere: only that some are off, and where.
                turnedOffInstallations.length > 0 &&
                  'The environments you turned off in Profile and settings, Environments, are not checked.',
              ]
                .filter(Boolean)
                .join(' ')}
            />
          )}
        {belongsNowhere && (
          <EmptyStateCard
            title="You belong to no organization"
            description={sentence(none ?? NO_ORGANIZATION_HINT)}
          />
        )}
        {answered.map(installation => {
          const answer = organizationsOf(installation);
          if (!answer || answer.organizations.length === 0) {
            return null;
          }
          return (
            <PageSection key={installation} title={installation}>
              <List aria-label={`Your organizations on ${installation}`}>
                {answer.organizations.map(organization => {
                  const id = organization.name;
                  const href = detailRoute?.({
                    installation,
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
                        organization.namespace,
                        !organization.deleting &&
                        !isOrganizationReady(organization)
                          ? 'not ready yet'
                          : undefined,
                        organization.permissions.manage
                          ? 'you manage it'
                          : undefined,
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    >
                      {/* The name is a real link, as AgentUsageList's rows
                          have: it looks like one, and opens in a new tab.
                          The row's own href still opens it on a press. */}
                      {href ? (
                        <Link
                          href={href}
                          truncate={isPhone ? undefined : true}
                          title={isPhone ? undefined : label}
                          style={isPhone ? NAME_TWO_LINES : NAME_ONE_LINE}
                        >
                          {label}
                        </Link>
                      ) : (
                        label
                      )}
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
  const connectorSignIns = unchecked
    .filter(entry => entry.reason === 'connectorSignIn')
    .map(entry => entry.installation);
  // muster's own name for the connector, as the rows' sign-in says it.
  const connectorLabel = useConnectorLabel(
    connectorSignIns[0],
    AGENT_MANAGER_SERVER,
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
              ' Sign in to Muster for the installation you use on the Connectors page, then open the list below and check it again.'}
            {!musterSignIn &&
              connectorSignIns.length > 0 &&
              // Whether a sign-in to the connector helps, or a new sign-in
              // to the portal, is the row's to say: it knows how the
              // connector signs in.
              ` The portal has no valid sign-in to the ${connectorLabel} connector on ${joinNames(
                connectorSignIns,
              )}: open the list below to see what helps.`}
            {!musterSignIn &&
              connectorSignIns.length === 0 &&
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

/**
 * Asks, as the person, whether they may create an `Organization` on one
 * installation (`create`, cluster-wide: what `create_organization` checks
 * first), and passes the answer up: the page offers Create organization
 * only where it is yes. agent-manager still decides the create.
 */
function CreateAccessProbe({
  installation,
  onAnswer,
}: {
  installation: string;
  onAnswer: (installation: string, allowed: boolean) => void;
}) {
  const { allowed } = useSelfSubjectAccessReview(installation, {
    group: 'security.giantswarm.io',
    resource: 'organizations',
    verb: 'create',
  });
  useEffect(() => {
    onAnswer(installation, allowed);
  }, [installation, allowed, onAnswer]);
  return null;
}
