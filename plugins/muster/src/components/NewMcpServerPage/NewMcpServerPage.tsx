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
import type { McpServerTransport } from '../../lib/mcpServerDefinition';
import { useMusterInstance } from '../MusterInstanceProvider';
import { InstallationPicker } from '../InstallationPicker';
import { useNewMcpServerForm } from '../NewMcpServerFormProvider';
import { SelectableCard, SelectableCardGrid } from '../SelectableCard';
import { TextAreaField } from './TextAreaField';

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
    detailsErrors,
  } = useNewMcpServerForm();

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
                      secondaryLabel="auto-derived"
                      isRequired
                      value={state.slug}
                      onChange={setSlug}
                      placeholder="weather"
                      description="Becomes the server's resource name and its tools' prefix."
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
                  onChange={setUrl}
                  placeholder="https://mcp.example.com/mcp"
                  description="The server's MCP endpoint."
                />
                <SelectableCardGrid ariaLabel="Transport" minWidth={280}>
                  {TRANSPORTS.map(transport => (
                    <SelectableCard
                      key={transport.value}
                      selected={state.transport === transport.value}
                      ariaLabel={`Transport ${transport.title}`}
                      onSelect={() => setTransport(transport.value)}
                    >
                      <Text weight="bold">{transport.title}</Text>
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
