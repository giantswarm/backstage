import { useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import { Switch, Text } from '@backstage/ui';
import { Link, Progress } from '@backstage/core-components';
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
import {
  isStableVersion,
  parseChartRef,
} from '@giantswarm/backstage-plugin-gs-common';

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

export type OciTagsListCardProps = {
  ociRepository: string;
  viewAllPath?: string;
};

export const OciTagsListCard = ({
  ociRepository,
  viewAllPath = 'version-history',
}: OciTagsListCardProps) => {
  const classes = useStyles();
  const [showAll, setShowAll] = useState(false);
  const { tags, latestStableVersion, isLoading, error } =
    useHelmChartTags(ociRepository);

  const renderContent = () => {
    if (isLoading) {
      return <Progress />;
    }

    if (error) {
      if (error.name === 'NotFoundError') {
        const { repository } = parseChartRef(ociRepository);
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

    const shownTags = showAll
      ? tags
      : tags.filter(tagInfo => isStableVersion(tagInfo.tag));

    if (shownTags.length === 0) {
      return (
        <Text color="secondary">
          No stable releases yet. Turn on Show all to see release candidates and
          dev builds.
        </Text>
      );
    }

    const displayedTags = shownTags.slice(0, MAX_TAGS_TO_DISPLAY);

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
        tags && tags.length > 0 && !error ? (
          <Switch label="Show all" isSelected={showAll} onChange={setShowAll} />
        ) : undefined
      }
      footerActions={
        <Link component={RouterLink} to={viewAllPath}>
          View all versions →
        </Link>
      }
    >
      {renderContent()}
    </InfoCard>
  );
};
