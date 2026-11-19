import { useId } from 'react';
import { useRouteRef } from '@backstage/frontend-plugin-api';
import { Alert, Checkbox, CheckboxGroup, Flex, Text } from '@backstage/ui';
import { makeStyles } from '@material-ui/core';
import {
  ExternalLink,
  LoadingIndicator,
} from '@giantswarm/backstage-plugin-ui-react';

import { useConnectorsSupport } from '../../hooks/useConnectorsSupport';
import { useFormHarnessRuntime } from '../../hooks/useFormHarnessRuntime';
import { useOrganizationConnectors } from '../../hooks/useOrganization';
import { runtimeLabel } from '../../lib/harnesses';
import {
  connectorReadiness,
  offerableConnectors,
  ORGANIZATION_CONNECTORS_LABEL,
  sameNames,
} from '../../lib/organizationConnectors';
import type { OrganizationConnector } from '../../lib/organizations';
import { organizationOf } from '../../lib/tenants';
import { organizationDetailRouteRef } from '../../routes';
import { useNewAgentForm } from '../NewAgentFormProvider';
import { useOrganizationDirectory } from '../OrganizationDirectoryProvider';

/** The line under the heading: whose credential the agent calls them with. */
export const SHARED_CREDENTIAL_LINE =
  'An agent uses each of these connectors with the credential the organization stored for it, the same for everybody who uses the agent.';

/**
 * What the section says while *Nothing outside the chat* is picked: that
 * option turns these connectors off too, and which option gives the agent
 * these connectors alone.
 */
export const CHAT_ONLY_CONNECTORS_LINE =
  'Nothing outside the chat, picked above, turns these connectors off too. To give the agent only these connectors, pick Only the tools I choose below and choose no other tool.';

const useStyles = makeStyles(theme => ({
  heading: {
    marginBottom: theme.spacing(1),
  },
  // The lines under a checkbox line up with its label.
  details: {
    paddingLeft: theme.spacing(3.5),
    overflowWrap: 'anywhere',
  },
}));

/** What happens with a connector, in words: never by colour alone. */
function ConnectorLines({
  connector,
  connectorsTab,
  id,
}: {
  connector: OrganizationConnector;
  connectorsTab: string | undefined;
  id: string;
}) {
  const classes = useStyles();
  const { ready, credentialMissing, notAccepted } =
    connectorReadiness(connector);
  const notAcceptedWhy = [connector.reason, connector.message]
    .filter(Boolean)
    .join(': ');
  return (
    <Flex direction="column" gap="0.5" className={classes.details} id={id}>
      {connector.description && (
        <Text variant="body-small" color="secondary">
          {connector.description}
        </Text>
      )}
      {ready && (
        <Text variant="body-small" color="secondary">
          Ready to use.
        </Text>
      )}
      {credentialMissing && (
        <Text variant="body-small" color="warning">
          Credential missing: the agent cannot use this connector until the
          organization stores its credential.{' '}
          {/* The Connectors tab offers Replace credential to an admin of the
              organization, never for a connector the platform curates. */}
          {connector.curated ? (
            'The platform curates this connector, so its credential is not set on the organization page.'
          ) : (
            <>
              An admin of the organization sets it with Replace credential on
              the organization&apos;s Connectors tab.{' '}
              {connectorsTab && (
                <ExternalLink href={connectorsTab} display="inline">
                  Open the Connectors tab
                </ExternalLink>
              )}
            </>
          )}
        </Text>
      )}
      {notAccepted && (
        <Text variant="body-small" color="warning">
          Not accepted: the agent cannot use this connector until it is fixed.
          {notAcceptedWhy ? ` ${notAcceptedWhy.replace(/\.?$/, '.')}` : ''}
        </Text>
      )}
    </Flex>
  );
}

/**
 * The Tools step's organization connectors: with an organization chosen,
 * its own connectors (`list_organization_connectors`, as the person), the
 * kagent RemoteMCPServers its Connectors tab lists, picked by name beside the
 * muster servers above and sent as `connectors`. Not shown outside an
 * organization; where they cannot work (an agent-manager that does not take
 * them, a coding Harness), the section says why instead of offering them.
 * A connector with a missing credential or not accepted can still be picked:
 * agent-manager takes it, and the line under it says what happens.
 */
export function OrganizationConnectors() {
  const classes = useStyles();
  const headingId = useId();
  const { state, edit, setConnectors } = useNewAgentForm();
  const { directory } = useOrganizationDirectory();
  const installation = state.installation;
  const namespace = edit ? edit.agent.namespace : state.tenant;
  const organization = namespace
    ? organizationOf(namespace, directory)
    : undefined;
  const support = useConnectorsSupport(installation, Boolean(edit));
  const { isCoding, onPlatformHarness, harness } = useFormHarnessRuntime();
  const runtimeKnown = isCoding !== undefined || onPlatformHarness;
  const offered = support === 'supported' && runtimeKnown && !isCoding;
  const read = useOrganizationConnectors(
    installation ?? '',
    offered && organization ? organization.namespace : undefined,
  );
  const organizationRoute = useRouteRef(organizationDetailRouteRef);

  if (!installation || !organization) {
    return null;
  }
  const organizationHref = organizationRoute?.({
    installation,
    parent: organization.parent,
    name: organization.organization,
  });
  const connectorsTab = organizationHref && `${organizationHref}/connectors`;

  const picked = state.connectors;
  // Nothing outside the chat holds these off too, as it does the muster
  // servers above (and picking it drops them).
  const chatOnly = Boolean(state.toolsChatOnly);
  const listed = offerableConnectors(read.data ?? [], picked);
  const unlisted =
    read.isLoading || read.failure
      ? []
      : picked.filter(name => !listed.some(c => c.name === name));
  const refusal =
    state.connectorsRefusal &&
    sameNames(state.connectorsRefusal.connectors, picked)
      ? state.connectorsRefusal.messages
      : [];

  let body;
  if (support === 'reading' || (support === 'supported' && !runtimeKnown)) {
    body = <LoadingIndicator label="Reading what this environment takes…" />;
  } else if (support === 'unread') {
    body = (
      <Text variant="body-small" color="secondary">
        Could not read whether the agent-manager of {installation} takes these
        connectors, so they are not offered.
      </Text>
    );
  } else if (support === 'unsupported') {
    body = (
      <Text variant="body-small" color="secondary">
        The agent-manager of {installation} cannot give an agent these
        connectors yet.
      </Text>
    );
  } else if (isCoding) {
    body = (
      <Text variant="body-small" color="secondary">
        An agent on {harness.title ?? harness.name} cannot use these connectors:
        only an agent on the {runtimeLabel('kagent')} runtime can
        {edit ? '.' : ', which is chosen on the first step.'}
      </Text>
    );
  } else if (read.isLoading && picked.length === 0) {
    body = <LoadingIndicator label="Reading the organization's connectors…" />;
  } else if (listed.length === 0 && picked.length === 0 && !read.failure) {
    body = (
      // A connector is not added on the organization page: an admin of the
      // organization has an agent add it (`set_organization_connector`).
      <Text variant="body-small" color="secondary">
        The organization has no connector of its own yet. An admin of the
        organization adds one by asking an agent with the Agent Manager tools to
        add it, with the connector&apos;s address and credential.{' '}
        {connectorsTab && (
          <ExternalLink href={connectorsTab} display="inline">
            See the organization&apos;s connectors
          </ExternalLink>
        )}
      </Text>
    );
  } else {
    body = (
      <Flex direction="column" gap="2">
        {chatOnly && (
          <Text variant="body-small" color="secondary">
            {CHAT_ONLY_CONNECTORS_LINE}
          </Text>
        )}
        {read.failure && (
          <div role="status">
            <Alert
              status="warning"
              title="Could not read the organization's connectors"
              description={`${read.failure.message} The connectors already picked are kept.`}
            />
          </div>
        )}
        {(listed.length > 0 || picked.length > 0) && (
          <CheckboxGroup
            aria-labelledby={headingId}
            isDisabled={chatOnly}
            value={picked}
            onChange={setConnectors}
          >
            {listed.map(connector => (
              <Flex key={connector.name} direction="column" gap="0.5">
                <Checkbox
                  value={connector.name}
                  aria-describedby={`${headingId}-${connector.name}`}
                >
                  {connector.name}
                </Checkbox>
                <ConnectorLines
                  connector={connector}
                  connectorsTab={connectorsTab}
                  id={`${headingId}-${connector.name}`}
                />
              </Flex>
            ))}
            {unlisted.map(name => (
              <Flex key={name} direction="column" gap="0.5">
                <Checkbox value={name}>{name}</Checkbox>
                <Text
                  variant="body-small"
                  color="warning"
                  className={classes.details}
                >
                  Not in the organization any more: the agent cannot use it.
                  Unselect it to save the agent without it.
                </Text>
              </Flex>
            ))}
          </CheckboxGroup>
        )}
      </Flex>
    );
  }

  return (
    <section aria-labelledby={headingId}>
      <Text
        as="h3"
        id={headingId}
        variant="title-x-small"
        weight="bold"
        className={classes.heading}
      >
        {ORGANIZATION_CONNECTORS_LABEL}
      </Text>
      <Flex direction="column" gap="2">
        <Text variant="body-small" color="secondary">
          {SHARED_CREDENTIAL_LINE}
        </Text>
        {refusal.length > 0 && (
          <Alert
            status="danger"
            title="agent-manager refused these connectors"
            description={
              <Flex direction="column" gap="1">
                {refusal.map(message => (
                  <Text key={message} as="p" variant="body-small">
                    {message}
                  </Text>
                ))}
              </Flex>
            }
          />
        )}
        {body}
      </Flex>
    </section>
  );
}
