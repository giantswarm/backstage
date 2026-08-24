import { useEffect, useMemo, useRef } from 'react';
import { useNavigate, Navigate } from 'react-router-dom';
import { Content } from '@backstage/core-components';
import { useApi } from '@backstage/core-plugin-api';
import { useRouteRef } from '@backstage/frontend-plugin-api';
import { useQuery } from '@tanstack/react-query';
import { Alert, Button, Card, CardBody, Flex, Text } from '@backstage/ui';
import { Box, makeStyles } from '@material-ui/core';
import { useProvidePageHeaderActions } from '@giantswarm/backstage-plugin-ui-react';

import { musterApiRef } from '../../apis';
import { mcpServersRouteRef, newMcpServerRouteRef } from '../../routes';
import { mcpServerStateSeverity, type MCPServerState } from '../../lib/k8s';
import { decodeDexSubject } from '../../lib/dexSubject';
import { useMusterInstance } from '../MusterInstanceProvider';
import { useNewMcpServerForm } from '../NewMcpServerFormProvider';
import { ServerSignIn, StateBadge, severityTone } from '../shared';
import {
  DefRow,
  HealthDetails,
  ServerTools,
} from '../McpServersPage/serverDetail';

/**
 * How often the live runtime list is re-read while the server is still
 * connecting or waiting for a sign-in. Deliberately unbounded in duration —
 * this step is a status panel, not a gate, so there is no timeout to hit.
 */
const VERIFY_POLL_INTERVAL_MS = 5_000;

/** Once connected the panel only confirms; the instance provider's 30s CRD
 * refresh covers drift, so the fast poll can stop. */
const SETTLED_POLL_INTERVAL_MS = 30_000;

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
  grid: {
    display: 'grid',
    gridTemplateColumns: 'minmax(140px, max-content) 1fr',
    columnGap: theme.spacing(2),
    rowGap: theme.spacing(0.75),
    alignItems: 'baseline',
  },
  code: {
    fontFamily: 'monospace',
  },
}));

/**
 * Step 4 (Verify) of the MCP server registration wizard: a live status panel,
 * not a gate. The CR already exists when this opens, so nothing blocks and
 * there is no artificial timeout — the panel watches the CR status and the
 * per-session runtime enrichment until the server is Connected with its tools
 * discovered.
 *
 * `Auth Required` is a normal state here, not a failure: OAuth servers need a
 * one-time per-user sign-in, offered inline through the same machinery the
 * server detail view uses (so leaving mid-verify is safe — the flow can be
 * finished from the server's page at any time).
 */
export function NewMcpServerVerifyPage() {
  const classes = useStyles();
  const navigate = useNavigate();
  const musterApi = useApi(musterApiRef);
  const detailsLink = useRouteRef(newMcpServerRouteRef);
  const serversLink = useRouteRef(mcpServersRouteRef);
  const { state, registeredName, reset } = useNewMcpServerForm();
  const { mcpServers, retry } = useMusterInstance();

  const installation = state.installation;
  const serverName = registeredName;

  // The CR was just created, but the provider's CRD read refreshes on a 30s
  // interval — kick one refresh on mount so the panel doesn't open on a stale
  // list. Ref'd so the effect runs exactly once (retry's identity changes with
  // every provider render).
  const retryRef = useRef(retry);
  retryRef.current = retry;
  useEffect(() => {
    retryRef.current();
  }, []);

  const cr = useMemo(
    () =>
      mcpServers.find(
        s => s.getName() === serverName && s.cluster === installation,
      ),
    [mcpServers, serverName, installation],
  );

  // Live per-session runtime view (state, status message, session tool count,
  // registeredBy). Shares the query key with the server manager's RuntimeState
  // so the two agree; the fast interval only applies while this page watches.
  const { data: runtimeData } = useQuery({
    queryKey: ['muster', 'servers', installation],
    queryFn: () => musterApi.listServers(installation),
    enabled: Boolean(installation && serverName),
    refetchInterval: query => {
      const runtimeState = (query.state.data?.mcpServers ?? []).find(
        s => s.name === serverName,
      )?.state;
      return runtimeState === 'Connected' || runtimeState === 'Running'
        ? SETTLED_POLL_INTERVAL_MS
        : VERIFY_POLL_INTERVAL_MS;
    },
  });

  const runtime = (runtimeData?.mcpServers ?? []).find(
    s => s.name === serverName,
  );

  // The runtime view is per-session and fresher; the CR status is the fallback
  // while the aggregator hasn't picked the server up yet.
  const serverState = (runtime?.state ?? cr?.getState()) as
    MCPServerState | undefined;
  const severity = mcpServerStateSeverity(serverState);
  const authRequired = serverState === 'Auth Required';
  const connected = serverState === 'Connected' || serverState === 'Running';
  const failed = severity === 'error';
  const toolsCount = runtime?.toolsCount;

  const actions = useMemo(
    () => (
      <Flex gap="2">
        <Button
          variant="tertiary"
          onPress={() => detailsLink && navigate(detailsLink())}
        >
          Edit details
        </Button>
        <Button
          variant="primary"
          onPress={() => {
            reset();
            if (serversLink) {
              navigate(serversLink());
            }
          }}
        >
          Done
        </Button>
      </Flex>
    ),
    [detailsLink, serversLink, navigate, reset],
  );

  const isRedirecting = !serverName;
  useProvidePageHeaderActions(isRedirecting ? null : actions);

  // No registered server in this wizard run (deep link, reload, reset) —
  // there is nothing to verify here. The server detail view carries the same
  // machinery for servers registered earlier.
  if (isRedirecting) {
    return <Navigate to={detailsLink ? detailsLink() : '..'} replace />;
  }

  return (
    <Content>
      <div className={classes.column}>
        <Text
          as="p"
          variant="body-small"
          color="secondary"
          className={classes.stepLabel}
        >
          Step 4 of 4: Verify
        </Text>
        <Text
          as="h2"
          variant="title-large"
          weight="bold"
          className={classes.pageTitle}
        >
          Watching <span className={classes.code}>{serverName}</span> connect
        </Text>
        <Text as="p" color="secondary" className={classes.intro}>
          The server is registered on <strong>{state.installation}</strong>.
          This panel follows it live until it is connected and its tools are
          discovered. You can leave at any time — finish sign-in or check status
          later from the server&apos;s entry on the Servers page.
        </Text>

        <Flex direction="column" gap="4">
          <Card>
            <CardBody>
              <Flex direction="column" gap="3">
                <Text as="h3" variant="title-small" weight="bold">
                  Connection status
                </Text>
                <Box className={classes.grid}>
                  <DefRow label="State">
                    {serverState ? (
                      <StateBadge
                        tone={severityTone(severity)}
                        label={serverState}
                      />
                    ) : (
                      'Waiting for the server to appear…'
                    )}
                  </DefRow>
                  {runtime?.statusMessage && (
                    <DefRow label="Status">{runtime.statusMessage}</DefRow>
                  )}
                  {runtime?.sessionStatus && (
                    <DefRow label="Session">{runtime.sessionStatus}</DefRow>
                  )}
                  {toolsCount !== undefined && (
                    <DefRow label="Tools discovered">{toolsCount}</DefRow>
                  )}
                  {runtime?.registeredBy && (
                    <DefRow label="Registered by">
                      <span title={runtime.registeredBy}>
                        {runtime.registeredByEmail ??
                          decodeDexSubject(runtime.registeredBy) ??
                          runtime.registeredBy}
                      </span>
                    </DefRow>
                  )}
                </Box>
                {!serverState && (
                  <Text variant="body-small" color="secondary">
                    Newly registered servers can take a few seconds to show up
                    in the aggregator — this refreshes automatically.
                  </Text>
                )}
              </Flex>
            </CardBody>
          </Card>

          {authRequired && (
            <Card>
              <CardBody>
                <Flex direction="column" gap="3">
                  <Alert
                    status="info"
                    title="This server needs your sign-in — that's normal"
                    description="It authenticates users with their own account, so each user completes a one-time sign-in before its tools appear. Sign in now, or later from the server's page."
                  />
                  <ServerSignIn
                    serverName={serverName}
                    installation={installation}
                  />
                </Flex>
              </CardBody>
            </Card>
          )}

          {(failed || runtime?.error) && (
            <Card>
              <CardBody>
                <Flex direction="column" gap="3">
                  <Alert
                    status="danger"
                    title="The server is not connecting"
                    description={
                      runtime?.statusMessage ??
                      runtime?.error ??
                      'Muster reports a failure — details below.'
                    }
                  />
                  {runtime?.error && (
                    <Text variant="body-small" color="secondary">
                      {runtime.error}
                    </Text>
                  )}
                  {cr && <HealthDetails server={cr} />}
                  <Text variant="body-small" color="secondary">
                    Muster keeps retrying on the backoff shown above. A wrong
                    URL, transport or auth answer is fixable right here: “Edit
                    details” takes you back to the form and saves your fix as an
                    update to this same server.
                  </Text>
                  <Flex>
                    <Button
                      variant="secondary"
                      onPress={() => detailsLink && navigate(detailsLink())}
                    >
                      Edit details
                    </Button>
                  </Flex>
                </Flex>
              </CardBody>
            </Card>
          )}

          <Card>
            <CardBody>
              <Flex direction="column" gap="3">
                <Text as="h3" variant="title-small" weight="bold">
                  Tools
                </Text>
                {cr && (connected || (toolsCount ?? 0) > 0) ? (
                  <ServerTools server={cr} />
                ) : (
                  <Text variant="body-small" color="secondary">
                    {authRequired
                      ? 'Tools appear here after you sign in to the server.'
                      : 'Tools appear here once the server is connected and discovery has run.'}
                  </Text>
                )}
              </Flex>
            </CardBody>
          </Card>

          <Card>
            <CardBody>
              <Flex direction="column" gap="3">
                <Text as="p" variant="body-small" color="secondary">
                  “Edit details” keeps everything you entered and saves as an
                  update to this server. “Done” returns to the server list — the
                  connection carries on either way.
                </Text>
                {actions}
              </Flex>
            </CardBody>
          </Card>
        </Flex>
      </div>
    </Content>
  );
}
