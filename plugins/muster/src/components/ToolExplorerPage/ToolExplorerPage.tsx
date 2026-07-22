import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { makeStyles, Theme } from '@material-ui/core';
import BuildIcon from '@material-ui/icons/Build';
import { Content, EmptyState } from '@backstage/core-components';
import { Alert, Box, Button, Text } from '@backstage/ui';
import { useApi } from '@backstage/frontend-plugin-api';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { musterApiRef } from '../../apis';
import { ServerPrefixInfo } from '../../lib/toolGrouping';
import { InstallationPicker } from '../InstallationPicker';
import { useMusterInstance } from '../MusterInstanceProvider';
import { SectionHeader } from '../shared';
import { ToolBrowser } from './ToolBrowser';
import { ToolDetailPanel } from './ToolDetailPanel';
import { useToolPrefs } from './useToolPrefs';

const useStyles = makeStyles((theme: Theme) => ({
  // A responsive two-panel split (browser | detail); stacks on small screens.
  layout: {
    display: 'grid',
    gap: theme.spacing(2),
    gridTemplateColumns: '1fr',
    alignItems: 'start',
    [theme.breakpoints.up('md')]: {
      gridTemplateColumns: '5fr 7fr',
    },
  },
  panel: {
    border: `1px solid ${theme.palette.divider}`,
    borderRadius: theme.shape.borderRadius,
    padding: theme.spacing(2),
    height: '100%',
  },
  placeholder: {
    padding: theme.spacing(4),
    textAlign: 'center',
  },
}));

function AuthAffordance({ installation }: { installation: string }) {
  const musterApi = useApi(musterApiRef);
  const queryClient = useQueryClient();

  const { data } = useQuery({
    queryKey: ['muster', 'list-tools-auth', installation],
    queryFn: () => musterApi.listTools(installation),
  });

  const signIn = useMutation({
    mutationFn: () => musterApi.signIn(installation),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['muster'] });
    },
  });

  const servers = data?.servers_requiring_auth ?? [];
  if (servers.length === 0) {
    return null;
  }

  const description = `${servers.length} server${
    servers.length === 1 ? '' : 's'
  } require authentication and their tools are hidden until you sign in: ${servers
    .map(s => s.name)
    .join(', ')}.${
    signIn.isError ? ' Sign-in failed — check the muster auth provider.' : ''
  }`;

  return (
    <Box mb="3">
      <Alert
        status="warning"
        title="Authentication required"
        description={description}
        customActions={
          <Button
            variant="secondary"
            size="small"
            isPending={signIn.isPending}
            onClick={() => signIn.mutate()}
          >
            {signIn.isPending ? 'Signing in…' : 'Sign in'}
          </Button>
        }
      />
    </Box>
  );
}

function ExplorerBody({ installation }: { installation: string }) {
  const classes = useStyles();
  const { mcpServers, isLoading } = useMusterInstance();
  const [searchParams] = useSearchParams();
  // Deep-link entry points (e.g. a workflow's "Run" button or a server's
  // "open in tool explorer" link) preselect a tool via `?tool=` and/or scope
  // the browse search to a server via `?server=`.
  const toolParam = searchParams.get('tool') ?? undefined;
  const serverParam = searchParams.get('server') ?? undefined;
  const [selected, setSelected] = useState<string | undefined>(toolParam);
  const prefs = useToolPrefs(installation);

  // Map each aggregated server's tool-name prefix to its management cluster so
  // the browser can group server tools by the MC they federate.
  const servers = useMemo<ServerPrefixInfo[]>(
    () =>
      mcpServers.map(server => ({
        prefix: server.getToolNamePrefix(),
        serverName: server.getName(),
        managementCluster: server.getManagementCluster(),
        family: server.getFamily(),
      })),
    [mcpServers],
  );

  // A `?server=` deep link (without a specific tool) scopes the browse to that
  // server's tools by prefix -- not a free-text search, which would also match
  // every tool whose description mentions the segment (tools F4).
  const serverScope = toolParam ? undefined : serverParam;

  const handleSelect = (name: string) => {
    setSelected(name);
    prefs.pushRecent(name);
  };

  return (
    <>
      <AuthAffordance installation={installation} />
      <Box className={classes.layout}>
        <Box className={classes.panel}>
          <ToolBrowser
            installation={installation}
            selected={selected}
            onSelect={handleSelect}
            servers={servers}
            prefs={prefs}
            serverScope={serverScope}
            serversLoading={isLoading}
          />
        </Box>
        <Box className={classes.panel}>
          {selected ? (
            <ToolDetailPanel
              key={`${installation}/${selected}`}
              name={selected}
              installation={installation}
              isFavourite={prefs.isFavourite(selected)}
              onToggleFavourite={() => prefs.toggleFavourite(selected)}
            />
          ) : (
            <Box className={classes.placeholder}>
              <Text as="p" variant="body-medium">
                Select a tool to view its schema and run it.
              </Text>
              <Text as="p" variant="body-small" color="secondary">
                Press ⌘K to search, ↑/↓ to navigate, ↵ to open.
              </Text>
            </Box>
          )}
        </Box>
      </Box>
    </>
  );
}

/**
 * Unified explorer over muster's tool catalogue for one installation: browse
 * Core / Server / Workflow tools, search them (filter_tools BM25 ranking) with
 * keyboard navigation, inspect a tool's input schema (describe_tool) via a
 * typed form, and execute it through the guarded call_tool proxy with a
 * readable result viewer.
 */
export function ToolExplorerPage() {
  const { activeInstallation } = useMusterInstance();

  return (
    <Content>
      <SectionHeader
        icon={<BuildIcon />}
        title="Tool explorer"
        description="Browse, search, and run the tools this muster aggregates — core tools, every connected server, and workflows."
      />
      <InstallationPicker />

      {!activeInstallation ? (
        <EmptyState
          missing="data"
          title="Select an installation"
          description="Choose a muster installation above to browse and run its aggregated tools."
        />
      ) : (
        <ExplorerBody installation={activeInstallation} />
      )}
    </Content>
  );
}
