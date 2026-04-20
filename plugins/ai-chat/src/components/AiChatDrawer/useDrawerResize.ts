import { useCallback, useEffect, useRef, useState } from 'react';
import { useMediaQuery, useTheme } from '@material-ui/core';

const MIN_WIDTH = 400;
const MAX_WIDTH_RATIO = 0.8;
export const DEFAULT_WIDTH = 500;
const STORAGE_KEY = 'ai-chat-drawer-width';
const PUSH_STYLE_ID = 'ai-chat-drawer-push-style';

function setDrawerPushWidth(width: number): void {
  let style = document.getElementById(PUSH_STYLE_ID);
  if (!style) {
    style = document.createElement('style');
    style.id = PUSH_STYLE_ID;
    document.head.appendChild(style);
  }
  style.textContent = `
#root { margin-right: ${width}px; }
[class*="MuiDrawer-paperAnchorRight"] { right: ${width}px !important; }
`;
}

function clearDrawerPush(): void {
  document.getElementById(PUSH_STYLE_ID)?.remove();
}

function readStoredWidth(): number {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = Number(stored);
      if (Number.isFinite(parsed) && parsed >= MIN_WIDTH) {
        return parsed;
      }
    }
  } catch {
    // localStorage unavailable
  }
  return DEFAULT_WIDTH;
}

function clampWidth(width: number): number {
  const maxWidth = window.innerWidth * MAX_WIDTH_RATIO;
  return Math.max(MIN_WIDTH, Math.min(width, maxWidth));
}

interface UseDrawerResizeOptions {
  variant: 'persistent' | 'overlay';
  open: boolean;
}

interface ResizeHandleProps {
  onMouseDown: React.MouseEventHandler;
  onDoubleClick: React.MouseEventHandler;
}

interface UseDrawerResizeResult {
  width: number | undefined;
  drawerRef: React.RefObject<HTMLDivElement>;
  resizeHandleProps: ResizeHandleProps;
  isDragging: boolean;
}

export function useDrawerResize({
  variant,
  open,
}: UseDrawerResizeOptions): UseDrawerResizeResult {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('xs'));
  const [width, setWidth] = useState(() => clampWidth(readStoredWidth()));
  const [isDragging, setIsDragging] = useState(false);
  const drawerRef = useRef<HTMLDivElement>(null);
  const dragStateRef = useRef<{
    initialClientX: number;
    initialWidth: number;
  } | null>(null);

  // Manage #root marginRight and drawer push for persistent mode
  useEffect(() => {
    if (!open || variant !== 'persistent' || isMobile) {
      return undefined;
    }

    setDrawerPushWidth(width);

    return () => {
      clearDrawerPush();
    };
  }, [open, variant, width, isMobile]);

  const onMouseMove = useCallback(
    (e: MouseEvent) => {
      const state = dragStateRef.current;
      const drawerEl = drawerRef.current;
      if (!state || !drawerEl) return;

      // Left drag = wider for right-anchored drawer
      const newWidth = clampWidth(
        state.initialWidth + (state.initialClientX - e.clientX),
      );
      drawerEl.style.width = `${newWidth}px`;

      if (variant === 'persistent') {
        setDrawerPushWidth(newWidth);
      }
    },
    [variant],
  );

  const onMouseUp = useCallback(
    (e: MouseEvent) => {
      const state = dragStateRef.current;
      if (!state) return;

      const finalWidth = clampWidth(
        state.initialWidth + (state.initialClientX - e.clientX),
      );
      dragStateRef.current = null;

      setWidth(finalWidth);
      setIsDragging(false);

      try {
        localStorage.setItem(STORAGE_KEY, String(finalWidth));
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
      const drawerEl = drawerRef.current;
      if (!drawerEl) return;

      dragStateRef.current = {
        initialClientX: e.clientX,
        initialWidth: drawerEl.getBoundingClientRect().width,
      };

      setIsDragging(true);
      document.body.style.userSelect = 'none';
      document.body.style.cursor = 'col-resize';
      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
    },
    [onMouseMove, onMouseUp],
  );

  const onDoubleClick: React.MouseEventHandler = useCallback(() => {
    setWidth(DEFAULT_WIDTH);
    try {
      localStorage.setItem(STORAGE_KEY, String(DEFAULT_WIDTH));
    } catch {
      // localStorage unavailable
    }
  }, []);

  // Re-clamp width when the window is resized
  useEffect(() => {
    const handleResize = () => {
      setWidth(prev => clampWidth(prev));
    };
    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
    };
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

  return {
    width: isMobile ? undefined : width,
    drawerRef,
    resizeHandleProps: { onMouseDown, onDoubleClick },
    isDragging,
  };
}
