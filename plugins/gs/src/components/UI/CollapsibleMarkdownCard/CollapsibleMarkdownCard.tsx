import { useState, useRef, useEffect, useCallback, ReactNode } from 'react';
import { Progress } from '@backstage/core-components';
import {
  GSMarkdownContent,
  InfoCard,
} from '@giantswarm/backstage-plugin-ui-react';
import {
  Box,
  Button,
  Collapse,
  makeStyles,
  Typography,
} from '@material-ui/core';
import DescriptionIcon from '@material-ui/icons/Description';

const COLLAPSED_MAX_HEIGHT = 250;

const useStyles = makeStyles(theme => ({
  contentWrapper: {
    position: 'relative',
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

type CollapsibleMarkdownCardProps = {
  title: string;
  content: string | undefined | null;
  isLoading: boolean;
  error?: Error | null;
  emptyMessage: string;
  toggleLabels: { expand: string; collapse: string };
  // Optional override for specific error types (e.g. NotFoundError → friendly message).
  // Return undefined to fall through to the default error rendering.
  renderError?: (error: Error) => ReactNode | undefined;
};

export const CollapsibleMarkdownCard = ({
  title,
  content,
  isLoading,
  error,
  emptyMessage,
  toggleLabels,
  renderError,
}: CollapsibleMarkdownCardProps) => {
  const classes = useStyles();

  const [expanded, setExpanded] = useState(false);
  const [needsExpansion, setNeedsExpansion] = useState(false);
  const [collapsedSize, setCollapsedSize] = useState(COLLAPSED_MAX_HEIGHT);
  const contentRef = useRef<HTMLDivElement>(null);

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

  useEffect(() => {
    if (content) {
      updateContentSize();
    }
  }, [content, updateContentSize]);

  useEffect(() => {
    if (!content || !contentRef.current) {
      return undefined;
    }

    const resizeObserver = new ResizeObserver(() => {
      updateContentSize();
    });

    resizeObserver.observe(contentRef.current);

    return () => {
      resizeObserver.disconnect();
    };
  }, [content, updateContentSize]);

  // Detect when MarkdownContent finishes rendering its HTML inside the
  // Collapse. The Collapse constrains the outer height, so ResizeObserver
  // alone may not fire when content is injected asynchronously.
  useEffect(() => {
    if (!content || !contentRef.current) {
      return undefined;
    }

    const mutationObserver = new MutationObserver(() => {
      updateContentSize();
    });

    mutationObserver.observe(contentRef.current, {
      childList: true,
      subtree: true,
    });

    return () => {
      mutationObserver.disconnect();
    };
  }, [content, updateContentSize]);

  const handleToggle = () => {
    setExpanded(prev => !prev);
  };

  const renderBody = () => {
    if (isLoading) {
      return <Progress />;
    }

    if (error) {
      const customRendered = renderError?.(error);
      if (customRendered !== undefined) {
        return customRendered;
      }
      return <Typography color="error">{error.message}</Typography>;
    }

    if (!content) {
      return (
        <Typography variant="inherit" color="textSecondary">
          {emptyMessage}
        </Typography>
      );
    }

    return (
      <>
        <Box className={classes.contentWrapper}>
          <Collapse
            in={expanded || !needsExpansion}
            collapsedSize={collapsedSize}
          >
            <div ref={contentRef}>
              <GSMarkdownContent content={content} />
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
              {expanded ? toggleLabels.collapse : toggleLabels.expand}
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
          {title}
        </Box>
      }
    >
      {renderBody()}
    </InfoCard>
  );
};
