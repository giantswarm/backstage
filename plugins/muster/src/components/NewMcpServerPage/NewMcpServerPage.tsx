import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Content } from '@backstage/core-components';
import { useRouteRef } from '@backstage/frontend-plugin-api';
import {
  Alert,
  Button,
  Card,
  CardBody,
  Flex,
  Grid,
  Text,
  TextField,
} from '@backstage/ui';
import { makeStyles } from '@material-ui/core';
import {
  SectionHeader,
  useProvidePageHeaderActions,
} from '@giantswarm/backstage-plugin-ui-react';

import { mcpServersRouteRef, newMcpServerAuthRouteRef } from '../../routes';
import {
  AWS_REGION_META_KEY,
  formatMetaEntries,
  parseMetaEntries,
  type McpServerTransport,
} from '../../lib/mcpServerDefinition';
import { useMusterInstance } from '../MusterInstanceProvider';
import { InstallationPicker } from '../InstallationPicker';
import { useNewMcpServerForm } from '../NewMcpServerFormProvider';
import { SelectableCard, SelectableCardGrid } from '../SelectableCard';
import { StateBadge } from '../shared/StateBadge';
import { TextAreaField } from './TextAreaField';
import { useTransportDetection } from './useTransportDetection';

const useStyles = makeStyles(theme => ({
  column: {
    maxWidth: 960,
  },
  stepLabel: {
    marginBottom: theme.spacing(0.5),
  },
  pageTitle: {
    marginBottom: theme.spacing(1),
  },
  intro: {
    maxWidth: '70ch',
    marginBottom: theme.spacing(3),
  },
  footerNote: {
    maxWidth: '70ch',
    marginBottom: theme.spacing(2),
  },
}));

const TRANSPORTS: Array<{
  value: McpServerTransport;
  title: string;
  description: string;
}> = [
  {
    value: 'streamable-http',
    title: 'Streamable HTTP',
    description:
      'The current MCP transport. Use this unless the server only offers the legacy SSE endpoint.',
  },
  {
    value: 'sse',
    title: 'SSE',
    description:
      'The deprecated server-sent-events transport, for older servers that have not moved yet.',
  },
];

/**
 * Step 1 (Details) of the MCP server registration wizard: installation,
 * identity (display name → technical name, description), endpoint URL and
 * transport. Mirrors agent creation's NewAgentPage — shared form provider,
 * "Step X of N" label, validation surfaced on Continue.
 */
export function NewMcpServerPage() {
  const classes = useStyles();
  const navigate = useNavigate();
  const serversLink = useRouteRef(mcpServersRouteRef);
  const authLink = useRouteRef(newMcpServerAuthRouteRef);
  const { activeInstallation } = useMusterInstance();
  const {
    state,
    setName,
    setSlug,
    setDescription,
    setInstallation,
    setUrl,
    setTransport,
    setMeta,
    detailsErrors,
    registeredName,
  } = useNewMcpServerForm();

  // Metadata is a list in the form state but `NAME=value` lines here. The raw
  // text is local for the same reason the auth step's audiences are: parsing
  // on every keystroke would rewrite what the user is still typing. Seeded
  // from the state so stepping back into this page keeps what was entered.
  const [metaRaw, setMetaRaw] = useState(() => formatMetaEntries(state.meta));
  const onMetaChange = useCallback(
    (raw: string) => {
      setMetaRaw(raw);
      setMeta(parseMetaEntries(raw));
    },
    [setMeta],
  );

  // The wizard registers onto the section's active installation — the same
  // instance every muster view is scoped to, switched via the picker above the
  // form. Mirrored into the form state so validation and the composed
  // definition see it.
  useEffect(() => {
    if (state.installation !== activeInstallation) {
      setInstallation(activeInstallation);
    }
  }, [activeInstallation, state.installation, setInstallation]);

  // Show validation feedback only once the user has tried to proceed, so the
  // form doesn't shout about empty fields before they've done anything.
  const [showValidation, setShowValidation] = useState(false);

  // Transport auto-detection: once the URL looks complete, muster probes it
  // and the detected transport gets pre-selected. A manual card click wins
  // until the URL changes again; inconclusive detection changes nothing.
  const [transportTouched, setTransportTouched] = useState(false);
  const { detected } = useTransportDetection(state.url, state.installation);

  const onUrlChange = useCallback(
    (value: string) => {
      setUrl(value);
      setTransportTouched(false);
    },
    [setUrl],
  );

  useEffect(() => {
    if (!detected || transportTouched || state.transport === detected) {
      return;
    }
    setTransport(detected);
  }, [detected, transportTouched, state.transport, setTransport]);

  // The submit button stays enabled: clicking it with an invalid form surfaces
  // what's wrong (below) rather than silently doing nothing.
  const errorCount = detailsErrors.length;
  const onContinue = useCallback(() => {
    if (errorCount > 0) {
      setShowValidation(true);
      return;
    }
    if (authLink) {
      navigate(authLink());
    }
  }, [errorCount, authLink, navigate]);

  // Memoized so the header actions slot only updates when the handlers actually
  // change, not on every keystroke in the form (see useProvidePageHeaderActions).
  const actions = useMemo(
    () => (
      <Flex gap="2">
        <Button
          variant="tertiary"
          onPress={() => serversLink && navigate(serversLink())}
        >
          Cancel
        </Button>
        <Button variant="primary" onPress={onContinue}>
          Continue
        </Button>
      </Flex>
    ),
    [serversLink, navigate, onContinue],
  );

  // Surface the actions in the section's single header (Agent Platform) rather
  // than a second header of our own.
  useProvidePageHeaderActions(actions);

  return (
    <Content>
      <div className={classes.column}>
        <Text
          as="p"
          variant="body-small"
          color="secondary"
          className={classes.stepLabel}
        >
          Step 1 of 4: Details
        </Text>
        <Text
          as="h2"
          variant="title-large"
          weight="bold"
          className={classes.pageTitle}
        >
          Register an MCP server
        </Text>
        <Text as="p" className={classes.intro}>
          Bring an existing remote MCP server to the platform so agents can use
          its tools through the gateway.
        </Text>

        <Flex direction="column" gap="4">
          <InstallationPicker />

          <Card>
            <CardBody>
              <SectionHeader
                title="Identity"
                description="How this server appears across the platform."
              />
              <Flex direction="column" gap="4">
                <Grid.Root columns={{ initial: '1', sm: '2' }} gap="4">
                  <Grid.Item>
                    <TextField
                      label="Name"
                      isRequired
                      value={state.name}
                      onChange={setName}
                      placeholder="e.g. Weather"
                      description="The user-friendly name humans will use to refer to this server."
                    />
                  </Grid.Item>
                  <Grid.Item>
                    <TextField
                      label="Technical name"
                      secondaryLabel={
                        registeredName ? 'registered' : 'auto-derived'
                      }
                      isRequired
                      // Locked once registered: this is the CR's name, and a
                      // rename here would make the save target a different CR
                      // instead of updating the one just created.
                      isDisabled={Boolean(registeredName)}
                      value={state.slug}
                      onChange={setSlug}
                      placeholder="weather"
                      description={
                        registeredName
                          ? 'The server is already registered under this name; changes are saved as an update to it.'
                          : "Becomes the server's resource name and its tools' prefix."
                      }
                    />
                  </Grid.Item>
                </Grid.Root>
                <TextAreaField
                  label="Description"
                  secondaryLabel="optional"
                  value={state.description}
                  onChange={setDescription}
                  rows={4}
                  placeholder="What this server's tools are for, example tasks…"
                  description="Describe this server so team mates know what to use it for."
                />
              </Flex>
            </CardBody>
          </Card>

          <Card>
            <CardBody>
              <SectionHeader
                title="Endpoint"
                description="Where the server is reachable and how muster talks to it."
              />
              <Flex direction="column" gap="4">
                <TextField
                  label="URL"
                  isRequired
                  value={state.url}
                  onChange={onUrlChange}
                  placeholder="https://mcp.example.com/mcp"
                  description="The server's MCP endpoint."
                />
                <TextAreaField
                  label="Request metadata"
                  secondaryLabel="optional"
                  value={metaRaw}
                  onChange={onMetaChange}
                  rows={3}
                  placeholder={`${AWS_REGION_META_KEY}=eu-central-1`}
                  description={`One NAME=value per line, merged into every request muster sends this server. Most servers need none. AWS-hosted servers read the region they operate in from ${AWS_REGION_META_KEY} — without it they answer about their own default region instead of failing.`}
                />
                <SelectableCardGrid ariaLabel="Transport" minWidth={280}>
                  {TRANSPORTS.map(transport => (
                    <SelectableCard
                      key={transport.value}
                      selected={state.transport === transport.value}
                      ariaLabel={`Transport ${transport.title}`}
                      onSelect={() => {
                        setTransport(transport.value);
                        setTransportTouched(true);
                      }}
                    >
                      <Flex gap="2" align="center">
                        <Text weight="bold">{transport.title}</Text>
                        {detected === transport.value && (
                          <StateBadge tone="info" label="Detected" />
                        )}
                      </Flex>
                      <Text variant="body-small" color="secondary">
                        {transport.description}
                      </Text>
                    </SelectableCard>
                  ))}
                </SelectableCardGrid>
              </Flex>
            </CardBody>
          </Card>

          <Card>
            <CardBody>
              <Flex direction="column" gap="3">
                <Text as="p" color="secondary" className={classes.footerNote}>
                  The next step asks how users authenticate to this server, then
                  you review and register it.
                </Text>
                {showValidation && detailsErrors.length > 0 && (
                  <Alert
                    status="danger"
                    title="Please fix the following before continuing"
                    description={detailsErrors.join('. ')}
                  />
                )}
                {actions}
              </Flex>
            </CardBody>
          </Card>
        </Flex>
      </div>
    </Content>
  );
}
