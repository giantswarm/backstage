import { useState, useEffect, useCallback } from 'react';

// Callback ref + state so the effect re-runs when the element actually mounts.
// A plain useRef + useEffect([]) would silently no-op when the consumer
// conditionally renders the ref'd element on a later render.
export function useContainerDimensions(): [
  (node: Element | null) => void,
  { width: number; height: number },
] {
  const [node, setNode] = useState<Element | null>(null);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });

  const containerRef = useCallback((element: Element | null) => {
    setNode(element);
  }, []);

  useEffect(() => {
    if (!node) return undefined;

    const resizeObserver = new ResizeObserver(entries => {
      const { width, height } = entries[0].contentRect;
      setDimensions({ width, height });
    });

    resizeObserver.observe(node);

    return () => {
      resizeObserver.unobserve(node);
    };
  }, [node]);

  return [containerRef, dimensions];
}
