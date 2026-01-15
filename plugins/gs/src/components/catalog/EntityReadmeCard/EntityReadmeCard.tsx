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
  markdownContent: {
    // Typography
    '& h1': {
      ...theme.typography.h4,
      marginTop: theme.spacing(3),
      marginBottom: theme.spacing(2),
      '&:first-child': {
        marginTop: 0,
      },
    },
    '& h2': {
      ...theme.typography.h5,
      marginTop: theme.spacing(3),
      marginBottom: theme.spacing(1.5),
    },
    '& h3': {
      ...theme.typography.h6,
      marginTop: theme.spacing(2.5),
      marginBottom: theme.spacing(1),
    },
    '& h4, & h5, & h6': {
      ...theme.typography.subtitle1,
      fontWeight: theme.typography.fontWeightMedium,
      marginTop: theme.spacing(2),
      marginBottom: theme.spacing(1),
    },
    '& p': {
      ...theme.typography.body2,
      marginTop: 0,
      marginBottom: theme.spacing(2),
    },
    // Links
    '& a': {
      display: 'inline-block',
      color: theme.palette.primary.main,
      textDecoration: 'none',
      '&:hover': {
        textDecoration: 'underline',
      },
    },
    // Lists
    '& ul': {
      marginTop: 0,
      marginBottom: theme.spacing(2),
      paddingLeft: theme.spacing(3),
      listStyleType: 'disc',
    },
    '& ol': {
      marginTop: 0,
      marginBottom: theme.spacing(2),
      paddingLeft: theme.spacing(3),
      listStyleType: 'decimal',
    },
    '& li': {
      ...theme.typography.body2,
      marginBottom: theme.spacing(0.5),
    },
    '& li > ul, & li > ol': {
      marginTop: theme.spacing(0.5),
      marginBottom: 0,
    },
    // Code
    '& code': {
      fontFamily: 'monospace',
      fontSize: '0.875em',
      backgroundColor:
        theme.palette.type === 'dark'
          ? 'rgba(255, 255, 255, 0.1)'
          : 'rgba(0, 0, 0, 0.06)',
      padding: '0.2em 0.4em',
      borderRadius: theme.shape.borderRadius,
    },
    '& pre': {
      borderRadius: theme.shape.borderRadius,
      marginTop: 0,
      marginBottom: theme.spacing(2),
      '& code': {
        backgroundColor: 'transparent',
        padding: 0,
      },
    },
    // Blockquotes
    '& blockquote': {
      margin: theme.spacing(0, 0, 2, 0),
      padding: theme.spacing(1, 2),
      borderLeft: `4px solid ${theme.palette.divider}`,
      color: theme.palette.text.secondary,
      '& p:last-child': {
        marginBottom: 0,
      },
    },
    // Tables
    '& table': {
      width: '100%',
      borderCollapse: 'collapse',
      marginBottom: theme.spacing(2),
    },
    '& th, & td': {
      ...theme.typography.body2,
      padding: theme.spacing(1, 2),
      borderBottom: `1px solid ${theme.palette.divider}`,
      textAlign: 'left',
    },
    '& th': {
      fontWeight: theme.typography.fontWeightMedium,
      backgroundColor:
        theme.palette.type === 'dark'
          ? 'rgba(255, 255, 255, 0.05)'
          : 'rgba(0, 0, 0, 0.02)',
    },
    // Horizontal rule
    '& hr': {
      border: 'none',
      borderTop: `1px solid ${theme.palette.divider}`,
      margin: theme.spacing(3, 0),
    },
    // Images
    '& img': {
      maxWidth: '100%',
      height: 'auto',
    },
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
      return <Typography color="error">{error.message}</Typography>;
    }

    if (!readme) {
      return (
        <Typography variant="body2" color="textSecondary">
          No README available
        </Typography>
      );
    }

    return (
      <>
        <Box className={classes.contentWrapper}>
          <Collapse in={expanded} collapsedSize={collapsedSize}>
            <div ref={contentRef} className={classes.markdownContent}>
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
