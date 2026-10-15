import { useCallback, useEffect, useMemo, useRef } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useApi } from '@backstage/core-plugin-api';
import { useRouteRef } from '@backstage/frontend-plugin-api';
import { useQuery } from '@tanstack/react-query';
import { Alert, Button, Flex, Text } from '@backstage/ui';
import { makeStyles } from '@material-ui/core';
import CheckIcon from '@material-ui/icons/Check';
import {
  countNoun,
  ShowMore,
  useProvidePageHeaderActions,
  WizardStepHeading,
} from '@giantswarm/backstage-plugin-ui-react';

import { musterApiRef } from '../../apis';
import type { ToolSummary } from '../../apis/types';
import { newMcpServerAuthRouteRef, newMcpServerRouteRef } from '../../routes';
import { mcpServerStateSeverity, type MCPServerState } from '../../lib/k8s';
import { connectorDisplayNameOn } from '../../lib/serverGrouping';
import { toolEffect } from '../../lib/toolAnnotations';
import { useMusterInstance, useMusterSession } from '../MusterInstanceProvider';
import { useNewMcpServerForm } from '../NewMcpServerFormProvider';
import { EffectBadge, ServerSignIn, StateBadge, severityTone } from '../shared';
import { withEditParam } from '../NewMcpServerEditGate';
import {
  ConnectorWizardFrame,
  useConnectorWizardCloseHref,
} from './ConnectorWizardFrame';

/** How often the runtime list is re-read while the server is still settling. */
const TEST_POLL_INTERVAL_MS = 5_000;
/** Once connected the panel only confirms; the slow poll covers drift. */
const SETTLED_POLL_INTERVAL_MS = 30_000;

/**
 * How many tools the list shows first, and how many each *Show more* adds: a
 * preview of what the connector offers, not a catalogue to read through.
 */
const TOOL_PREVIEW_COUNT = 6;

const useStyles = makeStyles({
  connected: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    padding: '14px 16px',
    borderRadius: 12,
    background: 'var(--bui-success-bg-subdued, #e7f6ec)',
    color: 'var(--bui-success-fg-subdued, #14612a)',
    fontSize: 14,
    '& svg': { width: 18, height: 18, flex: 'none' },
  },
  toolHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    fontSize: 12.5,
    color: 'var(--bui-fg-secondary)',
    paddingBottom: 6,
    borderBottom: '1px solid var(--bui-border-1)',
  },
  tool: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    padding: '11px 0',
    borderBottom: '1px solid var(--bui-border-1)',
    fontSize: 14,
  },
  // An unbroken snake_case tool name wraps inside its column at 375px
  // rather than running under the effect badge.
  toolText: {
    flex: '1 1 auto',
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
    minWidth: 0,
    overflowWrap: 'anywhere',
  },
  toolEffect: {
    flex: 'none',
  },
  code: {
    fontFamily: 'monospace',
    overflowWrap: 'anywhere',
  },
});

/** "N tools — X that read and Y that change things." */
export function toolCountsLine(tools: ToolSummary[]): string {
  const reads = tools.filter(tool => toolEffect(tool) === 'reads').length;
  const changes = tools.length - reads;
  const noun = tools.length === 1 ? 'tool' : 'tools';
  return `${tools.length} ${noun} — ${reads} that read and ${changes} that change things`;
}

/**
 * Step 3 (Test) of the shell's connector wizard. The connector is already
 * registered when this opens (step 2's "Add connector" created it), so this is
 * a live status panel, not a gate: it follows the CR and the per-session
 * runtime view until the connector is connected, then lists what it offers —
 * each tool with whether it only reads or changes things.
 *
 * `Auth Required` is a normal state here: an OAuth connector needs this
 * person's one-time sign-in before it can be tested as them, offered inline
 * through the same machinery the connector page uses. Leaving mid-test is
 * safe — the connector keeps connecting either way.
 */
export function NewConnectorTestPage() {
  const classes = useStyles();
  const navigate = useNavigate();
  const musterApi = useApi(musterApiRef);
  const signInLink = useRouteRef(newMcpServerAuthRouteRef);
  const connectLink = useRouteRef(newMcpServerRouteRef);
  const closeHref = useConnectorWizardCloseHref();
  const { state, registeredName, lastSave, lastSaveAt, reset } =
    useNewMcpServerForm();
  const { mcpServers, mcpServersUpdatedAt, retry } = useMusterInstance();
  const { authenticated } = useMusterSession();

  const installation = state.installation;
  const serverName = registeredName;

  // The CR was just created, but the provider's CRD read refreshes on a 30s
  // interval — kick one refresh on mount so the panel doesn't open on a stale
  // list. Ref'd so the effect runs exactly once.
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

  // After an update the CR keeps the previous configuration's status until
  // muster reconciles the new spec, so a "Connected" read would confirm a
  // change not yet applied. The Ready condition's observedGeneration trailing
  // metadata.generation says so; the verdict waits until they agree. Until
  // the server list is read again after the update, the CR in hand is the
  // pre-update one (its generations agree), so that counts as applying too.
  const isPreUpdateRead =
    lastSave === 'update' &&
    lastSaveAt !== undefined &&
    (mcpServersUpdatedAt ?? 0) < lastSaveAt;
  const applying = isPreUpdateRead || Boolean(cr?.isReconcilePending());
  useEffect(() => {
    if (!applying) {
      return undefined;
    }
    const timer = setInterval(() => retryRef.current(), TEST_POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [applying]);

  // Live per-session runtime view; shares the query key with the server
  // manager's RuntimeState so the two agree. Background refetch stays on: the
  // connector takes up to a minute to connect, precisely the window where the
  // person switches tabs.
  const { data: runtimeData } = useQuery({
    queryKey: ['muster', 'servers', installation],
    queryFn: () => musterApi.listServers(installation),
    enabled: Boolean(installation && serverName),
    refetchInterval: query => {
      if (applying) {
        return TEST_POLL_INTERVAL_MS;
      }
      const runtimeState = (query.state.data?.mcpServers ?? []).find(
        s => s.name === serverName,
      )?.state;
      return runtimeState === 'Connected' ||
        runtimeState === 'Running' ||
        runtimeState === 'Awaiting Session'
        ? SETTLED_POLL_INTERVAL_MS
        : TEST_POLL_INTERVAL_MS;
    },
    refetchIntervalInBackground: true,
  });
  const runtime = (runtimeData?.mcpServers ?? []).find(
    s => s.name === serverName,
  );

  const serverState = (
    applying ? undefined : (runtime?.state ?? cr?.getState())
  ) as MCPServerState | undefined;
  const severity = mcpServerStateSeverity(serverState);
  // A sigv4 connector signs as muster's own machine identity — a 401 on it is
  // a config error, never something a sign-in fixes.
  const authRequired =
    serverState === 'Auth Required' && state.authMode !== 'sigv4';
  const awaitingSession = serverState === 'Awaiting Session';
  const connected = serverState === 'Connected' || serverState === 'Running';
  const failed = severity === 'error';
  const toolsCount = runtime?.toolsCount;

  // The connector's tools, read from the same aggregated catalogue agents use.
  const prefix = cr?.getToolNamePrefix() ?? `x_${serverName}`;
  const pattern = `${prefix}_*`;
  const toolsQuery = useQuery({
    queryKey: ['muster', 'server-tools', installation, pattern],
    queryFn: () => musterApi.filterTools({ installation, pattern, limit: 200 }),
    enabled: Boolean(
      authenticated &&
      installation &&
      serverName &&
      (connected || (toolsCount ?? 0) > 0),
    ),
  });
  const tools = toolsQuery.data?.tools ?? [];
  // muster answers one page (the 200 asked for); its total counts every match,
  // so a larger connector is said to be larger rather than cut silently.
  const toolsTotal = Math.max(toolsQuery.data?.total ?? 0, tools.length);
  const partial = toolsTotal > tools.length;

  const displayName = cr
    ? connectorDisplayNameOn(mcpServers, installation, cr.getName())
    : state.name.trim() || serverName || 'The connector';

  const onDone = useCallback(() => {
    reset();
    navigate(closeHref);
  }, [reset, navigate, closeHref]);

  const onBack = useCallback(() => {
    if (signInLink) {
      navigate(withEditParam(signInLink(), registeredName));
    }
  }, [signInLink, navigate, registeredName]);

  const actions = useMemo(
    () => (
      <Button variant="primary" onPress={onDone}>
        Done
      </Button>
    ),
    [onDone],
  );

  const isRedirecting = !serverName;
  useProvidePageHeaderActions(isRedirecting ? null : actions);

  // No registered connector in this wizard run (deep link, reload, reset) —
  // there is nothing to test yet.
  if (isRedirecting) {
    return <Navigate to={connectLink ? connectLink() : '..'} replace />;
  }

  let status;
  if (connected && tools.length > 0) {
    status = (
      <div className={classes.connected}>
        <CheckIcon aria-hidden />
        <span>
          <strong style={{ fontWeight: 500 }}>Connected.</strong> {displayName}{' '}
          offers{' '}
          {partial ? countNoun(toolsTotal, 'tool') : toolCountsLine(tools)}.
        </span>
      </div>
    );
  } else if (connected) {
    status = (
      <div className={classes.connected}>
        <CheckIcon aria-hidden />
        <span>
          <strong style={{ fontWeight: 500 }}>Connected.</strong>{' '}
          {toolsQuery.isFetching
            ? 'Asking the connector what it can do…'
            : 'No tools reported yet — discovery can take a moment.'}
        </span>
      </div>
    );
  } else {
    status = (
      <Flex align="center" gap="3">
        {applying || !serverState ? (
          <StateBadge tone="neutral" label="Connecting…" />
        ) : (
          <StateBadge
            tone={severityTone(severity)}
            label={serverState}
            title={cr?.getStateExplanation()}
          />
        )}
        <Text variant="body-small" color="secondary">
          {applying || !serverState
            ? 'Registered. This updates automatically once muster connects it.'
            : (runtime?.statusMessage ?? cr?.getStateExplanation() ?? '')}
        </Text>
      </Flex>
    );
  }

  return (
    <ConnectorWizardFrame step="test" onBack={onBack}>
      <WizardStepHeading title="Test the connection">
        The connector <span className={classes.code}>{serverName}</span> is
        registered on <strong>{installation}</strong>, tested as you. You can
        leave any time and finish later on the connector&apos;s page.
      </WizardStepHeading>

      {status}

      {authRequired && (
        <Flex direction="column" gap="3">
          <Alert
            status="info"
            title="This connector needs your sign-in — that's normal"
            description="Each person signs in once before its tools appear. Sign in now to test it, or later on the connector's page."
          />
          <ServerSignIn
            noun="connector"
            serverName={serverName}
            displayName={displayName}
            installation={installation}
          />
        </Flex>
      )}

      {awaitingSession && (
        <Alert
          status="info"
          title="This connector connects per session — that's normal"
          description={
            cr?.getStateExplanation() ??
            'It connects with each person’s own identity; its tools appear once muster has connected it for your session.'
          }
        />
      )}

      {!applying && (failed || runtime?.error) && (
        <Flex direction="column" gap="3">
          <Alert
            status="danger"
            title="The connector is not connecting"
            description={
              runtime?.statusMessage ??
              runtime?.error ??
              'Muster reports a failure.'
            }
          />
          <Text variant="body-small" color="secondary">
            Muster keeps retrying. To fix the address or sign-in, go Back — your
            entries are kept and saved as an update to this connector.
          </Text>
        </Flex>
      )}

      {tools.length > 0 && (
        <div>
          <div className={classes.toolHeader}>
            <span>Tool</span>
            <span>Effect</span>
          </div>
          <ShowMore items={tools} initial={TOOL_PREVIEW_COUNT} noun="tool">
            {visible => (
              <div>
                {visible.map(tool => (
                  <div key={tool.name} className={classes.tool}>
                    <span className={classes.toolText}>
                      <Text weight="bold">
                        {tool.name.startsWith(`${prefix}_`)
                          ? tool.name.slice(prefix.length + 1)
                          : tool.name}
                      </Text>
                      {(tool.summary ?? tool.description) && (
                        <Text variant="body-small" color="secondary">
                          {tool.summary ?? tool.description}
                        </Text>
                      )}
                    </span>
                    <span className={classes.toolEffect}>
                      <EffectBadge effect={toolEffect(tool)} />
                    </span>
                  </div>
                ))}
              </div>
            )}
          </ShowMore>
          {partial && (
            <Text as="p" variant="body-small" color="secondary">
              Only the first {tools.length} of {toolsTotal} tools are listed.
            </Text>
          )}
          <Text as="p" variant="body-small" color="secondary">
            Agents limited to read-only tools never get the ones that change
            things.
          </Text>
        </div>
      )}
    </ConnectorWizardFrame>
  );
}
