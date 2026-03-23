import { type ReactNode, useEffect, useRef } from 'react';
import { Box } from '@material-ui/core';

interface NodePoolDetailsLayoutProps {
  children: ReactNode;
  selectedNodePool: string | null;
  details: ReactNode;
}

export const NodePoolDetailsLayout = ({
  children,
  selectedNodePool,
  details,
}: NodePoolDetailsLayoutProps) => {
  const hasDetails = selectedNodePool !== null;
  const detailsRef = useRef<HTMLDivElement>(null);
  const lastScrolledForRef = useRef<string | null>(null);

  useEffect(() => {
    if (hasDetails && selectedNodePool !== lastScrolledForRef.current) {
      lastScrolledForRef.current = selectedNodePool;
      // Use requestAnimationFrame to let the DOM render first
      requestAnimationFrame(() => {
        detailsRef.current?.scrollIntoView({
          block: 'nearest',
          behavior: 'smooth',
        });
      });
    }
    if (!hasDetails) {
      lastScrolledForRef.current = null;
    }
  }, [hasDetails, selectedNodePool]);

  return (
    <Box>
      {children}

      {hasDetails && (
        <div ref={detailsRef}>
          <Box mt={4}>{details}</Box>
        </div>
      )}
    </Box>
  );
};
