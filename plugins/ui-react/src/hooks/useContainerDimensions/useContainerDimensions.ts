import { useState, useEffect, useRef, MutableRefObject } from 'react';

export function useContainerDimensions(): [
  MutableRefObject<null>,
  { width: number; height: number },
] {
  const containerRef = useRef(null);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const observeTarget = containerRef.current;

    if (!observeTarget) return;

    const resizeObserver = new ResizeObserver(entries => {
      const { width, height } = entries[0].contentRect;
      setDimensions({ width, height });
    });

    resizeObserver.observe(observeTarget);

    // eslint-disable-next-line consistent-return
    return () => {
      resizeObserver.unobserve(observeTarget);
    };
  }, []);

  return [containerRef, dimensions];
}
