/**
 * Polyfills for React features not available in React 18
 */
// eslint-disable-next-line no-restricted-syntax
import * as React from 'react';
import { useCallback, useRef, useLayoutEffect } from 'react';

// Polyfill for useEffectEvent (React 19.2+ feature)
// This is a simplified implementation that captures the current callback
// and provides a stable identity across renders
function useEffectEvent<T extends (...args: any[]) => any>(callback: T): T {
  const ref = useRef<T>(callback);

  useLayoutEffect(() => {
    ref.current = callback;
  });

  return useCallback(((...args: any[]) => ref.current(...args)) as T, []);
}

// Add the polyfill to React's namespace if it doesn't exist
if (typeof (React as any).useEffectEvent === 'undefined') {
  (React as any).useEffectEvent = useEffectEvent;
}

// Re-export for direct imports
export { useEffectEvent };

// This needs to be imported before any React components that use useEffectEvent
declare global {
  namespace React {
    function useEffectEvent<T extends (...args: any[]) => any>(callback: T): T;
  }
}
