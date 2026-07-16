import { Box, Typography, makeStyles, Theme } from '@material-ui/core';
import { EpicRef } from '../../apis';
import { useEpicBoardItem } from '../EpicChip/useEpicBoardItem';

const useStyles = makeStyles((theme: Theme) => ({
  root: {
    width: '100%',
    marginTop: theme.spacing(0.5),
  },
  names: {
    // Long assignee lists wrap onto multiple lines instead of overflowing.
    wordBreak: 'break-word',
  },
}));

/**
 * The epic's assignees as a plain, full-width line — meant to sit at the
 * bottom of a plan list item, below the EpicChip, so multiple assignees wrap
 * cleanly instead of overflowing the chip's narrow secondary-action slot.
 * Reads the same board item as EpicChip (shared query), and renders nothing
 * when the epic has no assignees or the roadmap plugin is unavailable.
 */
export function EpicAssignees({ epic }: { epic: EpicRef }) {
  const classes = useStyles();
  const { data: item } = useEpicBoardItem(epic);
  const assignees = item?.assignees ?? [];

  if (assignees.length === 0) {
    return null;
  }

  return (
    <Box className={classes.root}>
      <Typography
        className={classes.names}
        variant="caption"
        color="textSecondary"
      >
        {assignees.map(login => `@${login}`).join(', ')}
      </Typography>
    </Box>
  );
}
