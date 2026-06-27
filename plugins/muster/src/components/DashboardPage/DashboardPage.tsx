import { Box, Chip, Grid, Typography, makeStyles } from '@material-ui/core';
import {
  Content,
  InfoCard,
  Progress,
  StatusError,
  StatusOK,
  StatusWarning,
} from '@backstage/core-components';
import { useMusterData } from '../MusterDataProvider';
import { InstallationPicker } from '../InstallationPicker';
import { FleetHealthMatrix } from './FleetHealthMatrix';
import { MCPServer, mcpServerStateSeverity } from '../../lib/k8s';

const useStyles = makeStyles(theme => ({
  metric: {
    display: 'flex',
    flexDirection: 'column',
  },
  metricValue: {
    fontSize: '1.75rem',
    fontWeight: 600,
    lineHeight: 1.1,
  },
  metricLabel: {
    color: theme.palette.text.secondary,
  },
  legend: {
    display: 'flex',
    gap: theme.spacing(2),
    flexWrap: 'wrap',
    marginTop: theme.spacing(1),
  },
}));

function countBySeverity(servers: MCPServer[]) {
  let ok = 0;
  let warning = 0;
  let error = 0;
  for (const server of servers) {
    const severity = mcpServerStateSeverity(server.getState());
    if (severity === 'ok') ok += 1;
    else if (severity === 'error') error += 1;
    else warning += 1;
  }
  return { ok, warning, error };
}

const Metric = ({ value, label }: { value: number; label: string }) => {
  const classes = useStyles();
  return (
    <Box className={classes.metric}>
      <span className={classes.metricValue}>{value}</span>
      <span className={classes.metricLabel}>{label}</span>
    </Box>
  );
};

const InstallationCard = ({
  installation,
  servers,
  workflowCount,
}: {
  installation: string;
  servers: MCPServer[];
  workflowCount: number;
}) => {
  const managementClusters = new Set(
    servers.map(s => s.getManagementCluster()).filter(Boolean),
  );
  const { ok, warning, error } = countBySeverity(servers);

  return (
    <InfoCard title={installation} subheader="muster aggregator">
      <Grid container spacing={3}>
        <Grid item xs={4}>
          <Metric value={servers.length} label="MCP servers" />
        </Grid>
        <Grid item xs={4}>
          <Metric value={workflowCount} label="Workflows" />
        </Grid>
        <Grid item xs={4}>
          <Metric value={managementClusters.size} label="Target MCs" />
        </Grid>
      </Grid>
      <Box mt={2} display="flex" style={{ gap: 16 }} flexWrap="wrap">
        <StatusOK>{ok} healthy</StatusOK>
        <StatusWarning>{warning} pending</StatusWarning>
        <StatusError>{error} failed</StatusError>
      </Box>
    </InfoCard>
  );
};

export function DashboardPage() {
  const classes = useStyles();
  const { activeInstallations, mcpServers, workflows, isLoading } =
    useMusterData();

  const installations =
    activeInstallations.length > 0
      ? activeInstallations
      : Array.from(new Set(mcpServers.map(s => s.cluster)));

  return (
    <Content>
      <InstallationPicker />

      {isLoading ? (
        <Progress />
      ) : (
        <Grid container spacing={3}>
          {installations.map(installation => (
            <Grid item xs={12} md={4} key={installation}>
              <InstallationCard
                installation={installation}
                servers={mcpServers.filter(s => s.cluster === installation)}
                workflowCount={
                  workflows.filter(w => w.cluster === installation).length
                }
              />
            </Grid>
          ))}

          <Grid item xs={12}>
            <InfoCard title="Fleet health">
              <Typography variant="body2" color="textSecondary">
                MCPServer state by target management cluster and family, across
                the selected installations.
              </Typography>
              <Box className={classes.legend}>
                <Chip size="small" label="healthy: Connected / Running" />
                <Chip
                  size="small"
                  label="pending: Auth Required / Connecting / Stopped"
                />
                <Chip size="small" label="failed: Failed" />
              </Box>
              <Box mt={2}>
                <FleetHealthMatrix servers={mcpServers} />
              </Box>
            </InfoCard>
          </Grid>
        </Grid>
      )}
    </Content>
  );
}
