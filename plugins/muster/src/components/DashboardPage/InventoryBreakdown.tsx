import { Box, Paper, Typography, makeStyles, Theme } from '@material-ui/core';
import { MCPServer, MusterWorkflow } from '../../lib/k8s';
import {
  authPosture,
  serverProvenance,
  workflowSummary,
} from '../../lib/serverInventory';

const useStyles = makeStyles((theme: Theme) => ({
  card: {
    padding: theme.spacing(2),
    borderRadius: theme.shape.borderRadius * 2,
  },
  grid: {
    display: 'grid',
    gap: theme.spacing(3),
    [theme.breakpoints.up('sm')]: {
      gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
    },
  },
  heading: {
    display: 'block',
    marginBottom: theme.spacing(1),
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '0.08em',
    color: theme.palette.text.secondary,
  },
  rows: {
    display: 'grid',
    gridTemplateColumns: 'minmax(0, 1fr) max-content',
    columnGap: theme.spacing(2),
    rowGap: theme.spacing(0.5),
    alignItems: 'baseline',
  },
  label: {
    fontSize: 13,
    color: theme.palette.text.secondary,
  },
  value: {
    fontSize: 13,
    fontWeight: 600,
    fontVariantNumeric: 'tabular-nums',
  },
  empty: {
    fontSize: 13,
    color: theme.palette.text.secondary,
  },
}));

type Entry = { label: string; value: number };

function Column({
  title,
  entries,
  emptyLabel,
}: {
  title: string;
  entries: Entry[];
  emptyLabel: string;
}) {
  const classes = useStyles();
  return (
    <Box>
      <Typography variant="caption" className={classes.heading}>
        {title}
      </Typography>
      {entries.length === 0 ? (
        <span className={classes.empty}>{emptyLabel}</span>
      ) : (
        <Box className={classes.rows}>
          {entries.map(entry => (
            <Box key={entry.label} display="contents">
              <span className={classes.label}>{entry.label}</span>
              <span className={classes.value}>{entry.value}</span>
            </Box>
          ))}
        </Box>
      )}
    </Box>
  );
}

export interface InventoryBreakdownProps {
  servers: MCPServer[];
  workflows: MusterWorkflow[];
}

/**
 * The governance view of the installation's inventory: how its servers and
 * workflows are managed (GitOps-managed resources are read-only in the app
 * and change through a PR; live-registered ones can be edited in place), and
 * how the servers' users authenticate. All read from the CRDs -- no muster
 * session needed.
 */
export function InventoryBreakdown({
  servers,
  workflows,
}: InventoryBreakdownProps) {
  const classes = useStyles();
  const provenance = serverProvenance(servers);
  const flows = workflowSummary(workflows);
  const auth = authPosture(servers);

  return (
    <Paper variant="outlined" className={classes.card}>
      <Box className={classes.grid}>
        <Column
          title="MCP servers"
          emptyLabel="No servers"
          entries={[
            { label: 'GitOps-managed', value: provenance.gitops },
            { label: 'Registered live', value: provenance.adHoc },
            { label: 'Deactivated', value: provenance.suspended },
          ]}
        />
        <Column
          title="Workflows"
          emptyLabel="No workflows"
          entries={[
            { label: 'GitOps-managed', value: flows.gitops },
            { label: 'Ad-hoc', value: flows.adHoc },
            { label: 'Validation warnings', value: flows.validationWarnings },
          ]}
        />
        <Column
          title="Server authentication"
          emptyLabel="No servers"
          entries={auth.map(entry => ({
            label: entry.label,
            value: entry.count,
          }))}
        />
      </Box>
    </Paper>
  );
}
