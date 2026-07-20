import { makeStyles, Theme } from '@material-ui/core';

/**
 * Layout for a plan list item that carries an epic cross-link, shared by the
 * merged and proposed tabs. The epic assignees wrap onto a full-width line
 * below the row's main content, so the row becomes multi-line; the EpicChip
 * (in the secondary-action slot) is therefore anchored to the top instead of
 * floating at the vertical centre.
 *
 * NOTE: only the styles are shared here on purpose. The EpicAssignees and the
 * ListItemSecondaryAction/EpicChip must stay as two *direct* children of the
 * `ListItem` -- MUI v4 only treats a `ListItemSecondaryAction` as such when it
 * is the last direct child, so wrapping them in a fragment or extracting them
 * into a child component would silently break the chip positioning.
 */
export const useEpicListItemStyles = makeStyles((theme: Theme) => ({
  planItem: {
    flexWrap: 'wrap',
  },
  epicAction: {
    top: theme.spacing(2),
    transform: 'none',
  },
}));
