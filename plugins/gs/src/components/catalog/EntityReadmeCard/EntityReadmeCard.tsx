import { useState, useRef, useEffect, useCallback } from 'react';
import {
  InfoCard,
  MarkdownContent,
  Progress,
} from '@backstage/core-components';
import {
  Box,
  Button,
  Collapse,
  makeStyles,
  Typography,
} from '@material-ui/core';
import DescriptionIcon from '@material-ui/icons/Description';
import { useCurrentEntityChart } from '../EntityChartContext';
import { useHelmChartTags } from '../../hooks/useHelmChartTags';
import { useHelmChartReadme } from '../../hooks/useHelmChartReadme';
import { QueryClientProvider } from '../../QueryClientProvider';
import { parseChartRef } from '../../utils/parseChartRef';

const COLLAPSED_MAX_HEIGHT = 250;

const useStyles = makeStyles(theme => ({
  contentWrapper: {
    position: 'relative',
  },
  content: {
    overflow: 'hidden',
  },
  fadeOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 80,
    background: `linear-gradient(to bottom, transparent, ${theme.palette.background.paper})`,
    pointerEvents: 'none',
  },
  toggleButton: {
    display: 'flex',
    justifyContent: 'center',
    marginTop: theme.spacing(1),
  },
  titleIcon: {
    marginRight: theme.spacing(1),
    verticalAlign: 'middle',
  },
}));

const ReadmeCardContent = () => {
  const classes = useStyles();
  const { selectedChart } = useCurrentEntityChart();
  const {
    latestStableVersion,
    isLoading: isLoadingTags,
    error: tagsError,
  } = useHelmChartTags(selectedChart.ref);
  const {
    readme,
    isLoading: isLoadingReadme,
    error: readmeError,
  } = useHelmChartReadme(selectedChart.ref, latestStableVersion ?? undefined);

  const [expanded, setExpanded] = useState(false);
  const [needsExpansion, setNeedsExpansion] = useState(false);
  const [collapsedSize, setCollapsedSize] = useState(COLLAPSED_MAX_HEIGHT);
  const contentRef = useRef<HTMLDivElement>(null);

  const isLoading = isLoadingTags || isLoadingReadme;

  const error = tagsError || readmeError;

  const updateContentSize = useCallback(() => {
    if (contentRef.current) {
      const contentHeight = contentRef.current.scrollHeight;
      setNeedsExpansion(contentHeight > COLLAPSED_MAX_HEIGHT);
      setCollapsedSize(
        contentHeight > COLLAPSED_MAX_HEIGHT
          ? COLLAPSED_MAX_HEIGHT
          : contentHeight,
      );
    }
  }, []);

  // Update size when readme content changes
  useEffect(() => {
    if (readme) {
      updateContentSize();
    }
  }, [readme, updateContentSize]);

  // Update size when viewport resizes
  useEffect(() => {
    if (!readme || !contentRef.current) {
      return undefined;
    }

    const resizeObserver = new ResizeObserver(() => {
      updateContentSize();
    });

    resizeObserver.observe(contentRef.current);

    return () => {
      resizeObserver.disconnect();
    };
  }, [readme, updateContentSize]);

  const handleToggle = () => {
    setExpanded(prev => !prev);
  };

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

    if (!readme) {
      return (
        <Typography variant="inherit" color="textSecondary">
          No README available.
        </Typography>
      );
    }

    return (
      <>
        <Box className={classes.contentWrapper}>
          <Collapse in={expanded} collapsedSize={collapsedSize}>
            <div ref={contentRef}>
              <MarkdownContent content={readme} />
            </div>
          </Collapse>
          {needsExpansion && !expanded && (
            <div className={classes.fadeOverlay} />
          )}
        </Box>
        {needsExpansion && (
          <Box className={classes.toggleButton}>
            <Button
              variant="text"
              color="primary"
              onClick={handleToggle}
              size="small"
            >
              {expanded ? 'Show less' : 'Show full README'}
            </Button>
          </Box>
        )}
      </>
    );
  };

  return (
    <InfoCard
      title={
        <Box display="flex" alignItems="center">
          <DescriptionIcon className={classes.titleIcon} />
          README
        </Box>
      }
    >
      {renderContent()}
    </InfoCard>
  );
};

export const EntityReadmeCard = () => {
  return (
    <QueryClientProvider>
      <ReadmeCardContent />
    </QueryClientProvider>
  );
};
