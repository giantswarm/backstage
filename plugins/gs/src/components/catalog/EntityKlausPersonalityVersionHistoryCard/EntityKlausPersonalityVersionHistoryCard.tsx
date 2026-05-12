import { Link as RouterLink } from 'react-router-dom';
import { Link, Progress } from '@backstage/core-components';
import { useEntity } from '@backstage/plugin-catalog-react';
import { InfoCard } from '@giantswarm/backstage-plugin-ui-react';
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
import { useHelmChartTags } from '../../hooks/useHelmChartTags';
import { DateComponent } from '../../UI';
import { QueryClientProvider } from '../../QueryClientProvider';
import { getKlausPersonalityImageFromEntity } from '../../utils/entity';

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
  const { entity } = useEntity();
  const imageRef = getKlausPersonalityImageFromEntity(entity);
  const { tags, latestStableVersion, isLoading, error } =
    useHelmChartTags(imageRef);

  const renderContent = () => {
    if (!imageRef) {
      return (
        <Typography variant="inherit" color="textSecondary">
          No <code>giantswarm.io/klaus-personality-image</code> annotation set
          on this entity.
        </Typography>
      );
    }

    if (isLoading) {
      return <Progress />;
    }

    if (error) {
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
      headerActions={
        imageRef ? (
          <Link component={RouterLink} to="version-history">
            <Typography variant="body1">View all →</Typography>
          </Link>
        ) : undefined
      }
    >
      {renderContent()}
    </InfoCard>
  );
};

export const EntityKlausPersonalityVersionHistoryCard = () => {
  return (
    <QueryClientProvider>
      <VersionHistoryCardContent />
    </QueryClientProvider>
  );
};
