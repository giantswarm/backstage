import { useEffect, useState } from 'react';
import {
  Box,
  Button,
  Grid,
  MenuItem,
  Paper,
  TextField,
  Typography,
  makeStyles,
  Theme,
} from '@material-ui/core';
import { Alert } from '@material-ui/lab';
import { Content, EmptyState } from '@backstage/core-components';
import { useApi } from '@backstage/frontend-plugin-api';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { musterApiRef } from '../../apis';
import { InstallationPicker } from '../InstallationPicker';
import { useMusterData } from '../MusterDataProvider';
import { ToolBrowser } from './ToolBrowser';
import { ToolDetailPanel } from './ToolDetailPanel';

const useStyles = makeStyles((theme: Theme) => ({
  controls: {
    display: 'flex',
    alignItems: 'center',
    gap: theme.spacing(2),
    flexWrap: 'wrap',
    marginBottom: theme.spacing(2),
  },
  target: {
    minWidth: 220,
  },
  panel: {
    padding: theme.spacing(2),
    height: '100%',
  },
  placeholder: {
    padding: theme.spacing(4),
    textAlign: 'center',
    color: theme.palette.text.secondary,
  },
}));

/**
 * Pick which installation MCP calls target. The CRD tabs fan out over every
 * selected installation, but a tool call must hit one aggregator, so the
 * explorer narrows the multi-selection down to a single target.
 */
function TargetSelector({
  installations,
  value,
  onChange,
}: {
  installations: string[];
  value: string;
  onChange: (installation: string) => void;
}) {
  const classes = useStyles();
  if (installations.length <= 1) {
    return null;
  }
  return (
    <TextField
      select
      className={classes.target}
      size="small"
      variant="outlined"
      label="Target installation"
      value={value}
      onChange={e => onChange(e.target.value)}
    >
      {installations.map(installation => (
        <MenuItem key={installation} value={installation}>
          {installation}
        </MenuItem>
      ))}
    </TextField>
  );
}

function AuthAffordance({ installation }: { installation: string }) {
  const musterApi = useApi(musterApiRef);
  const queryClient = useQueryClient();

  const { data } = useQuery({
    queryKey: ['muster', 'list-tools-auth', installation],
    queryFn: () => musterApi.listTools(installation),
  });

  const signIn = useMutation({
    mutationFn: () => musterApi.signIn(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['muster'] });
    },
  });

  const servers = data?.servers_requiring_auth ?? [];
  if (servers.length === 0) {
    return null;
  }

  return (
    <Alert
      severity="warning"
      action={
        <Button
          color="inherit"
          size="small"
          disabled={signIn.isPending}
          onClick={() => signIn.mutate()}
        >
          {signIn.isPending ? 'Signing in…' : 'Sign in'}
        </Button>
      }
    >
      {servers.length} server{servers.length === 1 ? '' : 's'} require
      authentication and their tools are hidden until you sign in:{' '}
      {servers.map(s => s.name).join(', ')}.
      {signIn.isError && ' Sign-in failed — check the muster auth provider.'}
    </Alert>
  );
}

function ExplorerBody({ installation }: { installation: string }) {
  const classes = useStyles();
  const musterApi = useApi(musterApiRef);
  const [selected, setSelected] = useState<string | undefined>();

  const { data: installationsData } = useQuery({
    queryKey: ['muster', 'installations'],
    queryFn: () => musterApi.listInstallations(),
  });

  const allowMutations = Boolean(
    installationsData?.installations.find(i => i.name === installation)
      ?.allowMutations,
  );

  return (
    <>
      <AuthAffordance installation={installation} />
      <Grid container spacing={2}>
        <Grid item xs={12} md={5}>
          <Paper className={classes.panel} variant="outlined">
            <ToolBrowser
              installation={installation}
              selected={selected}
              onSelect={setSelected}
            />
          </Paper>
        </Grid>
        <Grid item xs={12} md={7}>
          <Paper className={classes.panel} variant="outlined">
            {selected ? (
              <ToolDetailPanel
                key={`${installation}/${selected}`}
                name={selected}
                installation={installation}
                allowMutations={allowMutations}
              />
            ) : (
              <Box className={classes.placeholder}>
                <Typography variant="body1">
                  Select a tool to view its schema and run it.
                </Typography>
              </Box>
            )}
          </Paper>
        </Grid>
      </Grid>
    </>
  );
}

/**
 * Unified explorer over muster's tool catalogue for one installation: browse
 * Core / Server / Workflow tools, search them (filter_tools BM25 ranking),
 * inspect a tool's input schema (describe_tool), and execute it through the
 * guarded call_tool proxy with a JSON result viewer.
 */
export function ToolExplorerPage() {
  const classes = useStyles();
  const { activeInstallations } = useMusterData();
  const [target, setTarget] = useState('');

  // Keep the single MCP target inside the (multi-)selected installations; reset
  // to the first when the selection changes out from under it.
  useEffect(() => {
    if (activeInstallations.length === 0) {
      setTarget('');
    } else if (!activeInstallations.includes(target)) {
      setTarget(activeInstallations[0]);
    }
  }, [activeInstallations, target]);

  return (
    <Content>
      <InstallationPicker />

      {activeInstallations.length === 0 ? (
        <EmptyState
          missing="data"
          title="Select an installation"
          description="Choose a muster installation above to browse and run its aggregated tools."
        />
      ) : (
        <>
          <Box className={classes.controls}>
            <TargetSelector
              installations={activeInstallations}
              value={target}
              onChange={setTarget}
            />
          </Box>
          {target && <ExplorerBody installation={target} />}
        </>
      )}
    </Content>
  );
}
