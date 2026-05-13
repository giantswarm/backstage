import { Box, Chip, makeStyles, Typography } from '@material-ui/core';
import { TableColumn } from '@backstage/core-components';
import {
  isTableColumnHidden,
  semverCompareSort,
} from '@giantswarm/backstage-plugin-ui-react';
import { DateComponent } from '../../UI';

export type OciTagData = {
  tag: string;
  isLatest: boolean;
  createdAt: string | null;
};

export const OciTagColumns = {
  TAG: 'tag',
  CREATED_AT: 'createdAt',
} as const;

const useStyles = makeStyles(theme => ({
  latestChip: {
    margin: 0,
    marginLeft: theme.spacing(1),
    backgroundColor: theme.palette.success.main,
    color: theme.palette.success.contrastText,
  },
}));

type LatestChipProps = {
  isLatest: boolean;
};

const LatestChip = ({ isLatest }: LatestChipProps) => {
  const classes = useStyles();

  if (!isLatest) {
    return null;
  }

  return <Chip label="Latest" size="small" className={classes.latestChip} />;
};

export function getOciTagColumns(
  visibleColumns?: string[],
): TableColumn<OciTagData>[] {
  const columns: TableColumn<OciTagData>[] = [
    {
      title: 'Tag',
      field: OciTagColumns.TAG,
      defaultSort: 'desc',
      render: (row: OciTagData) => (
        <Box display="flex" alignItems="center">
          <Typography variant="body2">{row.tag}</Typography>
          <LatestChip isLatest={row.isLatest} />
        </Box>
      ),
      customSort: semverCompareSort(row => row.tag),
    },
    {
      title: 'Created',
      field: OciTagColumns.CREATED_AT,
      type: 'datetime',
      render: (row: OciTagData) => (
        <DateComponent value={row.createdAt} relative />
      ),
    },
  ];

  return columns.map(column => ({
    ...column,
    hidden: isTableColumnHidden(column.field, {
      defaultValue: Boolean(column.hidden),
      visibleColumns,
    }),
  }));
}
