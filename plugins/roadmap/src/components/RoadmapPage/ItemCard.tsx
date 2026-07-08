import { MouseEvent } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import {
  Box,
  Card,
  CardContent,
  Chip,
  MenuItem,
  TextField,
  Tooltip,
  Typography,
  makeStyles,
  Theme,
} from '@material-ui/core';
import { BoardItem } from '../../apis';
import { KIND_FIELD, STATUS_FIELD } from '../../lib/board';

const useStyles = makeStyles((theme: Theme) => ({
  card: {
    marginBottom: theme.spacing(1),
  },
  content: {
    padding: theme.spacing(1.5),
    '&:last-child': {
      paddingBottom: theme.spacing(1.5),
    },
  },
  title: {
    fontSize: 14,
    fontWeight: 500,
    display: 'block',
    color: theme.palette.text.primary,
    textDecoration: 'none',
    '&:hover': {
      textDecoration: 'underline',
    },
  },
  meta: {
    display: 'flex',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: theme.spacing(0.5),
    marginTop: theme.spacing(1),
  },
  repoRef: {
    fontFamily: 'monospace',
    fontSize: 12,
    color: theme.palette.text.secondary,
  },
  statusSelect: {
    marginTop: theme.spacing(1),
  },
}));

/**
 * One board item. The title links to the in-portal detail view; the status
 * select mutates the board (per-user GitHub token) when `statusOptions` and
 * `onStatusChange` are provided.
 */
export function ItemCard({
  item,
  statusOptions,
  onStatusChange,
  showStatus = true,
}: {
  item: BoardItem;
  statusOptions?: string[];
  onStatusChange?: (item: BoardItem, status: string) => void;
  showStatus?: boolean;
}) {
  const classes = useStyles();
  const kind = item.fields[KIND_FIELD];
  const status = item.fields[STATUS_FIELD];

  const stopPropagation = (event: MouseEvent) => event.stopPropagation();

  return (
    <Card variant="outlined" className={classes.card}>
      <CardContent className={classes.content}>
        <Typography
          component={RouterLink}
          to={`item/${encodeURIComponent(item.id)}`}
          className={classes.title}
        >
          {item.title}
        </Typography>
        <Box className={classes.meta}>
          {item.repo && item.number && (
            <span className={classes.repoRef}>
              {item.repo.split('/').pop()}#{item.number}
            </span>
          )}
          {kind && <Chip size="small" label={kind} />}
          {item.assignees?.map(assignee => (
            <Tooltip key={assignee} title={assignee}>
              <Chip size="small" variant="outlined" label={assignee} />
            </Tooltip>
          ))}
        </Box>
        {showStatus && statusOptions && onStatusChange && (
          <TextField
            className={classes.statusSelect}
            select
            fullWidth
            size="small"
            variant="outlined"
            label="Status"
            value={status ?? ''}
            onClick={stopPropagation}
            onChange={event => onStatusChange(item, event.target.value)}
          >
            {statusOptions.map(option => (
              <MenuItem key={option} value={option}>
                {option}
              </MenuItem>
            ))}
          </TextField>
        )}
      </CardContent>
    </Card>
  );
}
