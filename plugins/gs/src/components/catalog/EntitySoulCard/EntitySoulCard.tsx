import { useState, useRef, useEffect, useCallback } from 'react';
import { MarkdownContent, Progress } from '@backstage/core-components';
import { useEntity } from '@backstage/plugin-catalog-react';
import { InfoCard } from '@giantswarm/backstage-plugin-ui-react';
import {
  Box,
  Button,
  Collapse,
  makeStyles,
  Typography,
} from '@material-ui/core';
import DescriptionIcon from '@material-ui/icons/Description';
import { useKlausSoul } from '../../hooks/useKlausSoul';
import { QueryClientProvider } from '../../QueryClientProvider';
import { getKlausSoulUrlFromEntity } from '../../utils/entity';

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

const SoulCardContent = () => {
  const classes = useStyles();
  const { entity } = useEntity();
  const soulUrl = getKlausSoulUrlFromEntity(entity);
  const { soul, isLoading, error } = useKlausSoul(soulUrl);

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
    if (soul) {
      updateContentSize();
    }
  }, [soul, updateContentSize]);

  useEffect(() => {
    if (!soul || !contentRef.current) {
      return undefined;
    }

    const resizeObserver = new ResizeObserver(() => {
      updateContentSize();
    });

    resizeObserver.observe(contentRef.current);

    return () => {
      resizeObserver.disconnect();
    };
  }, [soul, updateContentSize]);

  useEffect(() => {
    if (!soul || !contentRef.current) {
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
  }, [soul, updateContentSize]);

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

    if (!soul) {
      return (
        <Typography variant="inherit" color="textSecondary">
          No SOUL.md available.
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
              <MarkdownContent content={soul} />
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
              {expanded ? 'Show less' : 'Show full SOUL'}
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
          Soul
        </Box>
      }
    >
      {renderContent()}
    </InfoCard>
  );
};

export const EntitySoulCard = () => {
  return (
    <QueryClientProvider>
      <SoulCardContent />
    </QueryClientProvider>
  );
};
