import { Link as RouterLink } from 'react-router-dom';
import { InfoCard, Link, Progress } from '@backstage/core-components';
import {
  Box,
  Chip,
  List,
  ListItem,
  makeStyles,
  Typography,
} from '@material-ui/core';
import CalendarTodayIcon from '@material-ui/icons/CalendarToday';
import LocalOfferIcon from '@material-ui/icons/LocalOffer';
import { useCurrentEntityChart } from '../EntityChartContext';
import { useHelmChartTags } from '../../hooks/useHelmChartTags';
import { DateComponent } from '../../UI';
import { QueryClientProvider } from '../../QueryClientProvider';
import { parseChartRef } from '../../utils/parseChartRef';

const MAX_TAGS_TO_DISPLAY = 5;

const useStyles = makeStyles(theme => ({
  list: {
    padding: 0,
  },
  listItem: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: theme.spacing(1, 0),
    borderBottom: `1px solid ${theme.palette.divider}`,
    '&:last-child': {
      borderBottom: 'none',
    },
  },
  tagContainer: {
    display: 'flex',
    alignItems: 'center',
    gap: theme.spacing(1),
  },
  tagIcon: {
    color: theme.palette.text.secondary,
    fontSize: '1rem',
  },
  latestChip: {
    margin: 0,
    marginLeft: theme.spacing(1),
    backgroundColor: theme.palette.success.main,
    color: theme.palette.success.contrastText,
  },
  dateContainer: {
    flexShrink: 0,
    minWidth: 100,
    display: 'flex',
    alignItems: 'center',
    gap: theme.spacing(1),
  },
  dateIcon: {
    color: theme.palette.text.secondary,
    fontSize: '1rem',
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

const VersionHistoryCardContent = () => {
  const classes = useStyles();
  const { selectedChart } = useCurrentEntityChart();
  const { tags, latestStableVersion, isLoading, error } = useHelmChartTags(
    selectedChart.ref,
  );

  const renderContent = () => {
    if (isLoading) {
      return <Progress />;
    }

    if (error) {
      if (error.name === 'NotFoundError') {
        const { repository } = parseChartRef(selectedChart.ref);
        return (
          <Typography variant="inherit" color="textSecondary">
            The repository <code>{repository}</code> is not available in the
            registry.
          </Typography>
        );
      }
      return <Typography color="error">{error.message}</Typography>;
    }

    if (!tags || tags.length === 0) {
      return (
        <Typography variant="inherit" color="textSecondary">
          No tags found
        </Typography>
      );
    }

    const displayedTags = tags.slice(0, MAX_TAGS_TO_DISPLAY);

    return (
      <List className={classes.list}>
        {displayedTags.map(tagInfo => {
          const isLatest = tagInfo.tag === latestStableVersion;

          return (
            <ListItem
              key={tagInfo.tag}
              disableGutters
              className={classes.listItem}
            >
              <Box className={classes.tagContainer}>
                <LocalOfferIcon className={classes.tagIcon} />
                <Typography variant="body2">{tagInfo.tag}</Typography>
                <LatestChip isLatest={isLatest} />
              </Box>
              <Box className={classes.dateContainer}>
                <CalendarTodayIcon className={classes.dateIcon} />
                <DateComponent value={tagInfo.createdAt} relative />
              </Box>
            </ListItem>
          );
        })}
      </List>
    );
  };

  return (
    <InfoCard
      title="Version History"
      action={
        <Box mt={1} mr={1} pt={1}>
          <Link component={RouterLink} to="version-history">
            <Typography variant="body1">View all →</Typography>
          </Link>
        </Box>
      }
    >
      {renderContent()}
    </InfoCard>
  );
};

export const EntityVersionHistoryCard = () => {
  return (
    <QueryClientProvider>
      <VersionHistoryCardContent />
    </QueryClientProvider>
  );
};
