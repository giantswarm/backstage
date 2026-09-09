import { useMemo } from 'react';
import { useRouteRef } from '@backstage/frontend-plugin-api';
import { Alert, Flex, Text } from '@backstage/ui';
import { makeStyles } from '@material-ui/core';
import {
  Agent,
  RemoteMCPServer,
  useResources,
} from '@giantswarm/backstage-plugin-kubernetes-react';
import { ServerSignIn } from '@giantswarm/backstage-plugin-muster';
import { InfoCard } from '@giantswarm/backstage-plugin-ui-react';

import { useMusterPluginApi } from '../../hooks/useMusterPluginApi';
import { useMusterServers } from '../../hooks/useMusterServers';
import { useMusterToolCatalogue } from '../../hooks/useMusterToolCatalogue';
import { useToolsetResolution } from '../../hooks/useToolsetResolution';
import {
  buildCatalogue,
  gatewayEntry,
  parseSelector,
  presetLabel,
  toolsetOfAgent,
  toolsetShape,
  unsignedServerSelectors,
  remoteServerHeaders,
} from '../../lib/toolset';
import { musterToolExplorerExternalRouteRef } from '../../routes';
import { ToolsetResolutionList } from '../ToolsetResolutionList';
import { MUSTER_MCP_SERVER_NAME } from './helpers';

const useStyles = makeStyles(theme => ({
  selectors: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: theme.spacing(1),
  },
  selector: {
    fontFamily: 'monospace',
    fontSize: 13,
    padding: theme.spacing(0.25, 1),
    borderRadius: 999,
    border: `1px solid ${theme.palette.divider}`,
  },
  selectorUnmatched: {
    borderStyle: 'dashed',
    color: theme.palette.text.secondary,
    textDecoration: 'line-through',
  },
  heading: {
    marginTop: theme.spacing(1),
  },
}));

function selectorTitle(selector: string, isUnmatched: boolean) {
  if (isUnmatched) {
    return 'Matches nothing for you right now';
  }
  const parsed = parseSelector(selector);
  return parsed?.kind === 'preset' ? presetLabel(parsed.name) : undefined;
}

/** The declared selectors as chips, the ones matching nothing for the viewer struck through. */
function DeclaredSelectors({
  selectors,
  unmatched,
}: {
  selectors: string[];
  unmatched: string[];
}) {
  const classes = useStyles();
  const missing = new Set(unmatched);
  return (
    <div
      className={classes.selectors}
      role="list"
      aria-label="Declared toolset"
    >
      {selectors.map(selector => {
        const isUnmatched = missing.has(selector);
        return (
          <span
            key={selector}
            role="listitem"
            className={`${classes.selector} ${
              isUnmatched ? classes.selectorUnmatched : ''
            }`}
            title={selectorTitle(selector, isUnmatched)}
          >
            {selector}
            {isUnmatched ? ' (matches nothing for you)' : ''}
          </span>
        );
      })}
    </div>
  );
}

/**
 * The agent's toolset: what it declares, and what that resolves to for the
 * person looking at it.
 *
 * Reads the declaration off the Agent resource itself — the `X-Muster-Toolset`
 * header on the gateway tool entry, which the chart renders from the `toolset`
 * value — so this page, `kubectl get agent -o yaml` and agent-manager tell the
 * same story. Resolves it through the viewer's own muster session, which is
 * what an agent invoked by them would get: toolset ∩ their access. Where the
 * viewer's own access is what is missing (a server they have not signed in
 * to), the sign-in is offered instead of an empty list.
 *
 * Loud where it matters: an agent with no toolset at all is labelled
 * *implicit full access*, `preset:full` is *Full gateway access*, and a
 * chat-only agent is *No tools*. A toolset naming a preset the installation no
 * longer defines shows muster's own error (D12) — never a quietly empty list.
 */
export function AgentToolsetCard({ agent }: { agent: Agent }) {
  const classes = useStyles();
  const installation = agent.cluster;
  // One memo for both, so `selectors` keeps its identity across renders (the
  // resolution and grouping memos below depend on it).
  // The toolset header lives on the RemoteMCPServer the agent binds (the
  // `muster-<agent>` copy of the gateway), so the namespace's servers are read
  // alongside the agent.
  const { resources: remoteServers } = useResources(
    installation,
    RemoteMCPServer,
    { [installation]: { namespace: agent.getNamespace() } },
    { enableDiscovery: false },
  );
  const { declared, selectors } = useMemo(() => {
    const result = toolsetOfAgent(
      agent,
      gatewayEntry(MUSTER_MCP_SERVER_NAME),
      remoteServerHeaders(remoteServers),
    );
    return {
      declared: result,
      selectors: result.state === 'declared' ? result.selectors : [],
    };
  }, [agent, remoteServers]);
  const shape = toolsetShape(selectors);

  const musterApi = useMusterPluginApi();
  const catalogue = useMusterToolCatalogue(installation);
  const { servers } = useMusterServers(installation);
  // `preset:none` is exactly "no tools"; asking muster what it resolves to
  // would only ever answer nothing.
  const resolution = useToolsetResolution(
    installation,
    shape === 'none' ? [] : selectors,
  );
  const unsignedServers = useMemo(
    () =>
      unsignedServerSelectors(
        selectors,
        buildCatalogue(
          catalogue.tools,
          servers,
          catalogue.serversRequiringAuth,
        ),
      ),
    [selectors, catalogue.tools, servers, catalogue.serversRequiringAuth],
  );

  const toolExplorerRoute = useRouteRef(musterToolExplorerExternalRouteRef);
  const toolHref = toolExplorerRoute
    ? (name: string) =>
        `${toolExplorerRoute()}?installation=${encodeURIComponent(
          installation,
        )}&tool=${encodeURIComponent(name)}`
    : undefined;

  let body: React.ReactNode;
  if (declared.state === 'no-gateway') {
    body = (
      <Alert
        status="info"
        title="No tools"
        description="This agent has no gateway entry, so it has no tools beyond its own reasoning — what a toolset of preset:none renders to, and what a chat-only agent looks like."
      />
    );
  } else if (declared.state === 'implicit-full') {
    body = (
      <Alert
        status="warning"
        title="Implicit full access"
        description="This agent declares no toolset, so it can discover and call every tool the gateway exposes to whoever invokes it — platform administration included. Agents from before toolsets look like this until someone assigns one (agent-manager's update_agent, or the chart's toolset value)."
      />
    );
  } else {
    body = (
      <Flex direction="column" gap="3">
        <DeclaredSelectors
          selectors={selectors}
          unmatched={resolution.unmatched}
        />
        {shape === 'full' && (
          <Alert
            status="warning"
            title="Full gateway access"
            description="The toolset is the full preset: this agent can discover and call every tool the gateway exposes to whoever invokes it — platform administration included."
          />
        )}
        {shape === 'none' && (
          <Alert
            status="info"
            title="No tools"
            description="The toolset is preset:none: a chat-only agent."
          />
        )}
        {unsignedServers.length > 0 && musterApi && (
          <Flex direction="column" gap="2">
            <Alert
              status="info"
              title="Sign in to see these servers' tools"
              description={`${unsignedServers.join(
                ', ',
              )} — part of the toolset, but your session is not signed in to them, so their tools are not in the list below. Through you, the agent would not reach them either until you sign in.`}
            />
            {unsignedServers.map(selector => {
              const name = parseSelector(selector)?.name ?? selector;
              return (
                <ServerSignIn
                  key={selector}
                  serverName={name}
                  installation={installation}
                  showName
                />
              );
            })}
          </Flex>
        )}
        {shape !== 'none' && (
          <>
            <Text
              as="h4"
              variant="body-medium"
              weight="bold"
              className={classes.heading}
            >
              Resolves to, for you
              {resolution.status === 'resolved'
                ? ` (${resolution.tools.length})`
                : ''}
            </Text>
            <ToolsetResolutionList
              resolution={resolution}
              servers={servers}
              toolHref={toolHref}
            />
          </>
        )}
      </Flex>
    );
  }

  return <InfoCard title="Toolset">{body}</InfoCard>;
}
