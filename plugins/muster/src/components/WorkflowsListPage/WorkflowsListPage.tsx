import { useMemo, useState, MouseEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useRouteRef } from '@backstage/frontend-plugin-api';
import {
  Content,
  EmptyState,
  Link,
  Progress,
} from '@backstage/core-components';
import {
  Box,
  IconButton,
  InputAdornment,
  ListItemText,
  Menu,
  MenuItem,
  Divider,
  Select,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
  makeStyles,
  Theme,
} from '@material-ui/core';
import Search from '@material-ui/icons/Search';
import MoreHoriz from '@material-ui/icons/MoreHoriz';
import { InstallationPicker } from '../InstallationPicker';
import { useMusterInstance, useMusterSession } from '../MusterInstanceProvider';
import { AvailabilityBadge, StateBadge } from '../shared';
import { MusterWorkflow } from '../../lib/k8s';
import { isGitOpsManaged } from '../../lib/gitops';
import { searchByRelevance } from '../../lib/workflowSearch';
import { toolExplorerRouteRef, workflowDetailRouteRef } from '../../routes';
import { CreateWorkflowButton } from './WorkflowMutationActions';

type StatusFilter = 'all' | 'valid' | 'warnings';

const useStyles = makeStyles((theme: Theme) => ({
  // Fixed filter bar above the scrolling table (mockup's `border-b py-3`).
  filterBar: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: theme.spacing(1),
    paddingTop: theme.spacing(1.5),
    paddingBottom: theme.spacing(1.5),
    borderBottom: `1px solid ${theme.palette.divider}`,
  },
  search: {
    flex: '1 1 auto',
    maxWidth: 360,
  },
  availSelect: {
    width: 180,
  },
  showing: {
    marginLeft: 'auto',
    fontVariantNumeric: 'tabular-nums',
    color: theme.palette.text.secondary,
  },
  // Scrolling region whose header stays pinned (mockup's sticky header).
  tableRegion: {
    maxHeight: 'calc(100vh - 320px)',
  },
  headCell: {
    backgroundColor: theme.palette.background.paper,
    fontWeight: 600,
  },
  nameCell: {
    maxWidth: 360,
  },
  nameLink: {
    display: 'block',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    fontWeight: 500,
    fontSize: 13,
  },
  namespace: {
    fontFamily: 'monospace',
    fontSize: 13,
    color: theme.palette.text.secondary,
  },
  description: {
    display: '-webkit-box',
    WebkitLineClamp: 2,
    WebkitBoxOrient: 'vertical',
    overflow: 'hidden',
    maxWidth: 460,
    color: theme.palette.text.secondary,
  },
  numeric: {
    textAlign: 'right',
    fontVariantNumeric: 'tabular-nums',
    color: theme.palette.text.secondary,
  },
  emptyRow: {
    textAlign: 'center',
    padding: theme.spacing(4),
    color: theme.palette.text.secondary,
  },
}));

interface RowActionsProps {
  name: string;
  detailHref: string;
  runHref: string;
}

/** The mockup's per-row menu: Open / Run workflow… / Copy name. */
function RowActions({ name, detailHref, runHref }: RowActionsProps) {
  const navigate = useNavigate();
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
  const open = (e: MouseEvent<HTMLElement>) => setAnchorEl(e.currentTarget);
  const close = () => setAnchorEl(null);

  return (
    <>
      <IconButton
        size="small"
        aria-label="Row actions"
        onClick={open}
        data-testid={`workflow-actions-${name}`}
      >
        <MoreHoriz fontSize="small" />
      </IconButton>
      <Menu anchorEl={anchorEl} open={Boolean(anchorEl)} onClose={close}>
        <MenuItem
          onClick={() => {
            close();
            navigate(detailHref);
          }}
        >
          <ListItemText primary="Open" />
        </MenuItem>
        <MenuItem
          onClick={() => {
            close();
            navigate(runHref);
          }}
        >
          <ListItemText primary="Run workflow…" />
        </MenuItem>
        <Divider />
        <MenuItem
          onClick={() => {
            close();
            navigator.clipboard?.writeText(name);
          }}
        >
          <ListItemText primary="Copy name" />
        </MenuItem>
      </Menu>
    </>
  );
}

export function WorkflowsListPage() {
  const classes = useStyles();
  const { workflows, activeInstallation, isLoading } = useMusterInstance();
  const { authenticated } = useMusterSession();
  const workflowDetailLink = useRouteRef(workflowDetailRouteRef);
  const toolExplorerLink = useRouteRef(toolExplorerRouteRef);

  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');

  const detailHref = (workflow: MusterWorkflow) => {
    const base = workflowDetailLink?.({ name: workflow.getName() }) ?? '#';
    return workflow.cluster
      ? `${base}?installation=${encodeURIComponent(workflow.cluster)}`
      : base;
  };

  // Running a workflow executes its `workflow_<name>` tool, so "Run workflow…"
  // lands on the unified tool explorer with that tool preselected.
  const runHref = (workflow: MusterWorkflow) => {
    const base = toolExplorerLink?.() ?? '#';
    const params = new URLSearchParams();
    if (workflow.cluster) {
      params.set('installation', workflow.cluster);
    }
    params.set('tool', `workflow_${workflow.getName()}`);
    return `${base}?${params.toString()}`;
  };

  const filtered = useMemo(() => {
    const byStatus = workflows.filter(w => {
      const valid = w.isValid();
      if (statusFilter === 'valid' && !valid) return false;
      if (statusFilter === 'warnings' && valid) return false;
      return true;
    });
    // Token-boundary scored search (F3): "dex" must not match "index".
    return searchByRelevance(byStatus, query, w => ({
      name: w.getName(),
      description: w.getDescription() ?? '',
    }));
  }, [workflows, query, statusFilter]);

  if (isLoading) {
    return (
      <Content>
        <InstallationPicker />
        <Progress />
      </Content>
    );
  }

  if (!activeInstallation) {
    return (
      <Content>
        <InstallationPicker />
        <EmptyState
          missing="data"
          title="Select an installation"
          description="Choose a muster installation above to list its workflows."
        />
      </Content>
    );
  }

  return (
    <Content>
      <InstallationPicker />

      <Box className={classes.filterBar}>
        <TextField
          className={classes.search}
          variant="outlined"
          size="small"
          type="search"
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Search workflows…"
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <Search fontSize="small" color="disabled" />
              </InputAdornment>
            ),
          }}
        />
        <Select
          className={classes.availSelect}
          variant="outlined"
          margin="dense"
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value as StatusFilter)}
        >
          <MenuItem value="all">All workflows</MenuItem>
          <MenuItem value="valid">Valid only</MenuItem>
          <MenuItem value="warnings">Validation warnings</MenuItem>
        </Select>
        <Typography variant="caption" className={classes.showing}>
          Showing {filtered.length} of {workflows.length}
        </Typography>
        <CreateWorkflowButton
          installation={activeInstallation}
          authenticated={authenticated}
        />
      </Box>

      <TableContainer className={classes.tableRegion}>
        <Table stickyHeader size="small">
          <TableHead>
            <TableRow>
              <TableCell className={classes.headCell}>Name</TableCell>
              <TableCell className={classes.headCell}>Namespace</TableCell>
              <TableCell className={classes.headCell}>Description</TableCell>
              <TableCell className={classes.headCell} align="right">
                Steps
              </TableCell>
              <TableCell className={classes.headCell}>Available</TableCell>
              <TableCell className={classes.headCell}>Source</TableCell>
              <TableCell className={classes.headCell} padding="checkbox" />
            </TableRow>
          </TableHead>
          <TableBody>
            {filtered.map(w => {
              const href = detailHref(w);
              return (
                <TableRow key={`${w.cluster}/${w.getName()}`} hover>
                  <TableCell className={classes.nameCell}>
                    <Link
                      to={href}
                      className={classes.nameLink}
                      title={w.getName()}
                    >
                      {w.getName()}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <span className={classes.namespace}>
                      {w.getNamespace() ?? '-'}
                    </span>
                  </TableCell>
                  <TableCell>
                    <Typography
                      variant="caption"
                      className={classes.description}
                    >
                      {w.getDescription() ?? ''}
                    </Typography>
                  </TableCell>
                  <TableCell className={classes.numeric}>
                    {w.getStepCount()}
                  </TableCell>
                  <TableCell>
                    <Box display="flex" flexWrap="wrap" gridGap={4}>
                      <AvailabilityBadge available={w.isRunnable()} />
                      {w.hasValidationWarning() && (
                        <StateBadge tone="warning" label="Validation warning" />
                      )}
                    </Box>
                  </TableCell>
                  <TableCell>
                    {isGitOpsManaged(w) ? (
                      <StateBadge tone="info" label="GitOps" />
                    ) : (
                      <StateBadge tone="neutral" label="Manually added" />
                    )}
                  </TableCell>
                  <TableCell padding="checkbox">
                    <RowActions
                      name={w.getName()}
                      detailHref={href}
                      runHref={runHref(w)}
                    />
                  </TableCell>
                </TableRow>
              );
            })}
            {filtered.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className={classes.emptyRow}>
                  No workflows match your filters.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </TableContainer>

      <Box mt={1}>
        <Typography variant="caption" color="textSecondary">
          Read-only view of muster Workflow CRs.{' '}
          <Link to="https://github.com/giantswarm/muster">muster docs</Link>
        </Typography>
      </Box>
    </Content>
  );
}
