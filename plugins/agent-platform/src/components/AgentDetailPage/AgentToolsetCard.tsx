import { useMemo } from 'react';
import { useRouteRef } from '@backstage/frontend-plugin-api';
import { Alert, Flex, Text } from '@backstage/ui';
import { makeStyles } from '@material-ui/core';
import { Agent } from '@giantswarm/backstage-plugin-kubernetes-react';
import {
  serverPageResolver,
  ServerSignIn,
} from '@giantswarm/backstage-plugin-muster';
import {
  InfoCard,
  LoadingIndicator,
} from '@giantswarm/backstage-plugin-ui-react';

import { useAgentToolset } from '../../hooks/useAgentToolset';
import { useMusterPluginApi } from '../../hooks/useMusterPluginApi';
import { useMusterServers } from '../../hooks/useMusterServers';
import { useMusterToolCatalogue } from '../../hooks/useMusterToolCatalogue';
import { useToolsetResolution } from '../../hooks/useToolsetResolution';
import {
  buildCatalogue,
  parseSelector,
  labelOfPresetSelector,
  selectorLabel,
  toolsetShape,
  unsignedServerSelectors,
} from '../../lib/toolset';
import {
  musterServerToolExternalRouteRef,
  musterServersExternalRouteRef,
} from '../../routes';
import { ToolsetResolutionList } from '../ToolsetResolutionList';

const useStyles = makeStyles(theme => ({
  selectors: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: theme.spacing(1),
  },
  selector: {
    fontSize: 13,
    padding: theme.spacing(0.25, 1),
    borderRadius: 999,
    border: `1px solid ${theme.palette.divider}`,
    // A selector written out is one long token (a server prefix, a tool
    // name): it breaks inside its chip rather than run past the card.
    minWidth: 0,
    maxWidth: '100%',
    boxSizing: 'border-box',
    overflowWrap: 'anywhere',
  },
  selectorCode: {
    fontFamily: 'monospace',
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
  return isUnmatched
    ? `${selector} — matches nothing for you right now`
    : selector;
}

/**
 * The declared selectors as chips — a preset by its label, anything else as
 * written — the ones matching nothing for the viewer struck through.
 */
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
            className={[
              classes.selector,
              labelOfPresetSelector(selector) === undefined
                ? classes.selectorCode
                : '',
              isUnmatched ? classes.selectorUnmatched : '',
            ].join(' ')}
            title={selectorTitle(selector, isUnmatched)}
          >
            {selectorLabel(selector)}
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
 * Reads the declaration off the agent's carrier `RemoteMCPServer` — the
 * `X-Muster-Toolset` header the chart renders from the `toolset` value onto the
 * per-agent gateway server the template binds — so this page, `kubectl get
 * remotemcpserver -o yaml` and agent-manager tell the same story. Resolves it
 * through the viewer's own muster session, which is
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
  const namespace = agent.getNamespace();
  // Memoized on the read, so `selectors` keeps its identity across renders
  // (the resolution and grouping memos below depend on it).
  const { declared, isReading, isUnreadable } = useAgentToolset(agent);
  const selectors = useMemo(
    () => (declared.state === 'declared' ? declared.selectors : []),
    [declared],
  );
  const shape = toolsetShape(selectors);

  const musterApi = useMusterPluginApi();
  const catalogue = useMusterToolCatalogue(installation);
  const {
    servers,
    resources: serverResources,
    isLoading: isLoadingServers,
  } = useMusterServers(installation);
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

  // Each tool links to its page beneath the server offering it, by muster's
  // own rule, so the page lists the tool; a tool nothing attributes lands on
  // the servers list, searched for its name. No links until the servers are
  // read, so none change under the pointer.
  const serversRoute = useRouteRef(musterServersExternalRouteRef);
  const toolRoute = useRouteRef(musterServerToolExternalRouteRef);
  const toolHref = useMemo(() => {
    if (isLoadingServers) {
      return undefined;
    }
    const pageOfTool = serverPageResolver(serverResources);
    const scope = `?installation=${encodeURIComponent(installation)}`;
    return (name: string): string | undefined => {
      const server = pageOfTool(name);
      if (server && toolRoute) {
        return `${toolRoute({ server, tool: name })}${scope}`;
      }
      return serversRoute
        ? `${serversRoute()}${scope}&q=${encodeURIComponent(name)}`
        : undefined;
    };
  }, [
    isLoadingServers,
    serverResources,
    installation,
    toolRoute,
    serversRoute,
  ]);

  let body: React.ReactNode;
  if (declared.state === 'no-gateway') {
    // Decided by the agent's own bindings, so it is already final — a
    // chat-only agent has nothing to wait for and says so at once.
    body = (
      <Alert
        status="info"
        title="No tools"
        description="It has no gateway entry, so it is a chat-only agent with nothing beyond its own reasoning."
      />
    );
  } else if (isReading) {
    // Until the carrier read answers, nothing can be said — and saying it
    // cannot be read would be wrong on every healthy agent. The indicator
    // holds itself back for 250ms, so a read served from cache shows nothing
    // at all.
    body = <LoadingIndicator label="Reading the agent's toolset…" />;
  } else if (declared.state === 'unresolved') {
    body = isUnreadable ? (
      <Alert
        status="info"
        title="Toolset not readable"
        description={`The RemoteMCPServers in ${namespace} on ${installation} could not be read — unreachable, or your account may not list them. The toolset is declared on ${declared.carrier}, so it cannot be shown.`}
      />
    ) : (
      <Alert
        status="warning"
        title="Gateway server missing"
        description={`This agent binds the gateway through RemoteMCPServer ${declared.carrier}, which does not exist in ${namespace}. It reaches nothing, and its toolset cannot be read.`}
      />
    );
  } else if (declared.state === 'implicit-full') {
    body = (
      <Alert
        status="warning"
        title="Implicit full access"
        description={`No toolset declared: gateway server ${declared.carrier} carries no X-Muster-Toolset header, so this agent can call every tool the gateway exposes to whoever invokes it — platform administration included. Assign one with agent-manager's update_agent or the chart's toolset value.`}
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
            description="The full preset: this agent can call every tool the gateway exposes to whoever invokes it — platform administration included."
          />
        )}
        {shape === 'none' && (
          <Alert
            status="info"
            title="No tools"
            description="The toolset is preset:none, so this is a chat-only agent."
          />
        )}
        {unsignedServers.length > 0 && musterApi && (
          <Flex direction="column" gap="2">
            <Alert
              status="info"
              title="Sign in to see these servers' tools"
              description={`${unsignedServers.join(
                ', ',
              )} — in the toolset, but you are not signed in to them: their tools are missing below, and the agent cannot reach them through you.`}
            />
            {unsignedServers.map(selector => {
              const name = parseSelector(selector)?.name ?? selector;
              return (
                <ServerSignIn
                  noun="connector"
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
            {/* h3, not h4: bui's AccordionTrigger wraps every disclosure
                heading in an h3 at every depth, so an h4 here would put this
                section's own heading *below* the headings it contains. Flat
                is the best available outline until the trigger's level can be
                set. */}
            <Text
              as="h3"
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
