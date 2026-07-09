import { MouseEvent, useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import {
  Box,
  Card,
  CardContent,
  Chip,
  IconButton,
  Menu,
  MenuItem,
  Tooltip,
  Typography,
  makeStyles,
  Theme,
} from '@material-ui/core';
import MoreVertIcon from '@material-ui/icons/MoreVert';
import CheckIcon from '@material-ui/icons/Check';
import { useRouteRef } from '@backstage/frontend-plugin-api';
import { RoadmapItem } from '../../apis';
import { KIND_FIELD, STATUS_FIELD } from '../../lib/board';
import { itemRouteRef } from '../../routes';

const useStyles = makeStyles((theme: Theme) => ({
  card: {
    marginBottom: theme.spacing(1),
    cursor: 'grab',
    '&:active': {
      cursor: 'grabbing',
    },
  },
  content: {
    padding: theme.spacing(1.5),
    '&:last-child': {
      paddingBottom: theme.spacing(1.5),
    },
  },
  titleRow: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: theme.spacing(0.5),
  },
  title: {
    flexGrow: 1,
    fontSize: 14,
    fontWeight: 500,
    lineHeight: 1.35,
    color: 'inherit',
    textDecoration: 'none',
    '&:hover': {
      textDecoration: 'underline',
    },
  },
  menuButton: {
    marginTop: theme.spacing(-0.5),
    marginRight: theme.spacing(-0.5),
  },
  meta: {
    display: 'flex',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: theme.spacing(0.75),
    marginTop: theme.spacing(1),
  },
  metaText: {
    fontSize: 12,
    color: theme.palette.text.secondary,
  },
  kindChip: {
    height: 20,
    fontSize: 11,
  },
}));

/**
 * One board card: title linking to the item detail, Kind badge, issue
 * reference and assignees, plus a status menu for moving the item without
 * dragging. The whole card is draggable; the drop target is the column.
 */
export function ItemCard(props: {
  item: RoadmapItem;
  columns: string[];
  onMove: (itemId: string, status: string) => void;
}) {
  const { item, columns, onMove } = props;
  const classes = useStyles();
  const itemLink = useRouteRef(itemRouteRef);
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null);

  const status = item.fields[STATUS_FIELD];
  const kind = item.fields[KIND_FIELD];
  const reference = item.repo
    ? `${item.repo}#${item.number ?? ''}`
    : 'draft item';
  const assignees = item.assignees ?? [];

  const openMenu = (event: MouseEvent<HTMLElement>) => {
    event.stopPropagation();
    setMenuAnchor(event.currentTarget);
  };

  const selectStatus = (nextStatus: string) => {
    setMenuAnchor(null);
    if (nextStatus !== status) {
      onMove(item.id, nextStatus);
    }
  };

  return (
    <Card
      className={classes.card}
      variant="outlined"
      draggable
      onDragStart={event => {
        event.dataTransfer.setData('text/plain', item.id);
        event.dataTransfer.effectAllowed = 'move';
      }}
    >
      <CardContent className={classes.content}>
        <Box className={classes.titleRow}>
          <Typography
            className={classes.title}
            component={RouterLink}
            to={itemLink?.({ id: item.id }) ?? '#'}
          >
            {item.title}
          </Typography>
          <IconButton
            className={classes.menuButton}
            size="small"
            aria-label="Set status"
            onClick={openMenu}
          >
            <MoreVertIcon fontSize="small" />
          </IconButton>
        </Box>
        <Box className={classes.meta}>
          {kind && (
            <Chip
              className={classes.kindChip}
              size="small"
              variant="outlined"
              label={kind}
            />
          )}
          <span className={classes.metaText}>{reference}</span>
          {assignees.length > 0 && (
            <Tooltip title={assignees.join(', ')}>
              <span className={classes.metaText}>
                @{assignees[0]}
                {assignees.length > 1 && ` +${assignees.length - 1}`}
              </span>
            </Tooltip>
          )}
        </Box>
      </CardContent>
      <Menu
        anchorEl={menuAnchor}
        open={Boolean(menuAnchor)}
        onClose={() => setMenuAnchor(null)}
      >
        {columns.map(column => (
          <MenuItem
            key={column}
            dense
            selected={column === status}
            onClick={() => selectStatus(column)}
          >
            {column === status && <CheckIcon fontSize="small" />}
            {column}
          </MenuItem>
        ))}
      </Menu>
    </Card>
  );
}
