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
import { useMusterInstance } from '../MusterInstanceProvider';
import { AvailabilityBadge } from '../shared';
import { MusterWorkflow } from '../../lib/k8s';
import { workflowDetailRouteRef } from '../../routes';

type AvailFilter = 'all' | 'available' | 'unavailable';

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
}

/** The mockup's per-row menu: Open / Run workflow… / Copy name. */
function RowActions({ name, detailHref }: RowActionsProps) {
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
            navigate(
              detailHref.includes('?')
                ? `${detailHref}&run=1`
                : `${detailHref}?run=1`,
            );
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
  const workflowDetailLink = useRouteRef(workflowDetailRouteRef);

  const [query, setQuery] = useState('');
  const [avail, setAvail] = useState<AvailFilter>('all');

  const detailHref = (workflow: MusterWorkflow) => {
    const base = workflowDetailLink?.({ name: workflow.getName() }) ?? '#';
    return workflow.cluster
      ? `${base}?installation=${encodeURIComponent(workflow.cluster)}`
      : base;
  };

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return workflows.filter(w => {
      const available = w.isValid();
      if (avail === 'available' && !available) return false;
      if (avail === 'unavailable' && available) return false;
      if (!needle) return true;
      return (
        w.getName().toLowerCase().includes(needle) ||
        (w.getDescription() ?? '').toLowerCase().includes(needle)
      );
    });
  }, [workflows, query, avail]);

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
          value={avail}
          onChange={e => setAvail(e.target.value as AvailFilter)}
        >
          <MenuItem value="all">All workflows</MenuItem>
          <MenuItem value="available">Available only</MenuItem>
          <MenuItem value="unavailable">Unavailable only</MenuItem>
        </Select>
        <Typography variant="caption" className={classes.showing}>
          Showing {filtered.length} of {workflows.length}
        </Typography>
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
                    <AvailabilityBadge available={w.isValid()} />
                  </TableCell>
                  <TableCell padding="checkbox">
                    <RowActions name={w.getName()} detailHref={href} />
                  </TableCell>
                </TableRow>
              );
            })}
            {filtered.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className={classes.emptyRow}>
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
