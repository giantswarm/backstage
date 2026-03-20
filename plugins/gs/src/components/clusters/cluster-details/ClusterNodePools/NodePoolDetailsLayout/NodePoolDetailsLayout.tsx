import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Box, IconButton, Typography, makeStyles } from '@material-ui/core';
import CloseIcon from '@material-ui/icons/Close';

const DEFAULT_SPLIT_RATIO = 0.5;
const MIN_SPLIT_RATIO = 0.15;
const MAX_SPLIT_RATIO = 0.85;
const STORAGE_KEY = 'node-pool-details-split-ratio';
const HANDLE_HEIGHT = 6;

function readStoredRatio(): number {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = Number(stored);
      if (
        Number.isFinite(parsed) &&
        parsed >= MIN_SPLIT_RATIO &&
        parsed <= MAX_SPLIT_RATIO
      ) {
        return parsed;
      }
    }
  } catch {
    // localStorage unavailable
  }
  return DEFAULT_SPLIT_RATIO;
}

function clampRatio(ratio: number): number {
  return Math.max(MIN_SPLIT_RATIO, Math.min(ratio, MAX_SPLIT_RATIO));
}

const useStyles = makeStyles(theme => ({
  root: {
    display: 'flex',
    flexDirection: 'column',
    minHeight: 0,
  },
  tableContainer: {
    overflow: 'auto',
    flexShrink: 0,
  },
  resizeHandle: {
    height: HANDLE_HEIGHT,
    cursor: 'row-resize',
    flexShrink: 0,
    borderTop: `1px solid ${theme.palette.divider}`,
    '&:hover': {
      backgroundColor: theme.palette.action.hover,
    },
  },
  resizeHandleDragging: {
    backgroundColor: theme.palette.primary.main,
    opacity: 0.3,
  },
  detailsContainer: {
    overflow: 'auto',
    paddingTop: theme.spacing(2),
    paddingBottom: theme.spacing(2),
    minHeight: 0,
    flex: 1,
  },
  detailsHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: theme.spacing(1),
  },
}));

/**
 * Find the nearest scrollable ancestor.
 */
function findScrollableAncestor(el: HTMLElement): HTMLElement | null {
  let current = el.parentElement;
  while (current) {
    const { overflow, overflowY } = getComputedStyle(current);
    if (
      overflow === 'auto' ||
      overflow === 'scroll' ||
      overflowY === 'auto' ||
      overflowY === 'scroll'
    ) {
      return current;
    }
    current = current.parentElement;
  }
  return null;
}

/**
 * Get the offset of an element relative to a specific ancestor.
 */
function getOffsetRelativeTo(el: HTMLElement, ancestor: HTMLElement): number {
  let top = 0;
  let current: HTMLElement | null = el;
  while (current && current !== ancestor) {
    top += current.offsetTop;
    current = current.offsetParent as HTMLElement | null;
  }
  return top;
}

function useAvailableHeight(
  ref: React.RefObject<HTMLElement>,
  active: boolean,
): number | undefined {
  const [height, setHeight] = useState<number | undefined>(undefined);

  useEffect(() => {
    const el = ref.current;
    if (!el || !active) {
      setHeight(undefined);
      return;
    }

    const scrollAncestor = findScrollableAncestor(el);

    const measure = () => {
      if (scrollAncestor) {
        // Measure relative to the scrollable ancestor's visible area
        const offsetInAncestor = getOffsetRelativeTo(el, scrollAncestor);
        const h = scrollAncestor.clientHeight - offsetInAncestor;
        if (h > 100) {
          setHeight(h);
        }
      } else {
        // Fallback: measure from document offset
        const rect = el.getBoundingClientRect();
        const h = window.innerHeight - rect.top;
        if (h > 100) {
          setHeight(h);
        }
      }
    };

    // Measure after a frame to let layout settle on initial mount
    const raf = requestAnimationFrame(measure);

    const ro = new ResizeObserver(measure);
    ro.observe(document.documentElement);
    if (scrollAncestor) {
      ro.observe(scrollAncestor);
    }

    window.addEventListener('resize', measure);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [ref, active]);

  return height;
}

interface NodePoolDetailsLayoutProps {
  children: React.ReactNode;
  selectedNodePool: string | null;
  details: React.ReactNode;
  onClose: () => void;
}

export const NodePoolDetailsLayout = ({
  children,
  selectedNodePool,
  details,
  onClose,
}: NodePoolDetailsLayoutProps) => {
  const classes = useStyles();
  const rootRef = useRef<HTMLDivElement>(null);
  const [splitRatio, setSplitRatio] = useState(readStoredRatio);
  const [isDragging, setIsDragging] = useState(false);
  const dragStateRef = useRef<{
    initialClientY: number;
    initialRatio: number;
    containerHeight: number;
  } | null>(null);

  const hasDetails = selectedNodePool !== null;
  const availableHeight = useAvailableHeight(rootRef, hasDetails);

  // When the details panel is shown and we know our height, scroll ourselves
  // into view so we use the full viewport. This is a one-time scroll on open.
  const lastScrolledForRef = useRef<string | null>(null);
  useEffect(() => {
    if (
      hasDetails &&
      availableHeight &&
      selectedNodePool !== lastScrolledForRef.current
    ) {
      lastScrolledForRef.current = selectedNodePool;
      rootRef.current?.scrollIntoView({ block: 'nearest' });
    }
  }, [hasDetails, availableHeight, selectedNodePool]);

  // Reset scroll tracking when panel closes
  useEffect(() => {
    if (!hasDetails) {
      lastScrolledForRef.current = null;
    }
  }, [hasDetails]);

  // --- Drag resize logic ---

  const onMouseMove = useCallback((e: MouseEvent) => {
    const state = dragStateRef.current;
    if (!state || !rootRef.current) return;

    const deltaY = e.clientY - state.initialClientY;
    const deltaRatio = deltaY / state.containerHeight;
    const newRatio = clampRatio(state.initialRatio + deltaRatio);

    const tableContainer = rootRef.current.firstElementChild as HTMLElement;
    if (tableContainer) {
      tableContainer.style.height = `${newRatio * state.containerHeight}px`;
    }
  }, []);

  const onMouseUp = useCallback(
    (e: MouseEvent) => {
      const state = dragStateRef.current;
      if (!state) return;

      const deltaY = e.clientY - state.initialClientY;
      const deltaRatio = deltaY / state.containerHeight;
      const finalRatio = clampRatio(state.initialRatio + deltaRatio);

      dragStateRef.current = null;
      setSplitRatio(finalRatio);
      setIsDragging(false);

      try {
        localStorage.setItem(STORAGE_KEY, String(finalRatio));
      } catch {
        // localStorage unavailable
      }

      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
    },
    [onMouseMove],
  );

  const onMouseDown: React.MouseEventHandler = useCallback(
    e => {
      e.preventDefault();
      if (!rootRef.current) return;

      const containerHeight = rootRef.current.getBoundingClientRect().height;

      dragStateRef.current = {
        initialClientY: e.clientY,
        initialRatio: splitRatio,
        containerHeight,
      };

      setIsDragging(true);
      document.body.style.userSelect = 'none';
      document.body.style.cursor = 'row-resize';
      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
    },
    [splitRatio, onMouseMove, onMouseUp],
  );

  const onDoubleClick: React.MouseEventHandler = useCallback(() => {
    setSplitRatio(DEFAULT_SPLIT_RATIO);
    try {
      localStorage.setItem(STORAGE_KEY, String(DEFAULT_SPLIT_RATIO));
    } catch {
      // localStorage unavailable
    }
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
    };
  }, [onMouseMove, onMouseUp]);

  const isConstrained = hasDetails && availableHeight !== undefined;

  const tableHeight = isConstrained
    ? splitRatio * (availableHeight - HANDLE_HEIGHT)
    : undefined;

  return (
    <div
      ref={rootRef}
      className={classes.root}
      style={isConstrained ? { height: availableHeight } : undefined}
    >
      <Box
        className={classes.tableContainer}
        style={isConstrained ? { height: tableHeight } : undefined}
      >
        {children}
      </Box>
      {hasDetails && (
        <>
          <div
            className={`${classes.resizeHandle}${isDragging ? ` ${classes.resizeHandleDragging}` : ''}`}
            onMouseDown={onMouseDown}
            onDoubleClick={onDoubleClick}
          />
          <Box className={classes.detailsContainer}>
            <Box className={classes.detailsHeader}>
              <Typography variant="subtitle1" component="span">
                <strong>{selectedNodePool}</strong>
              </Typography>
              <IconButton size="small" onClick={onClose}>
                <CloseIcon />
              </IconButton>
            </Box>
            {details}
          </Box>
        </>
      )}
    </div>
  );
};
