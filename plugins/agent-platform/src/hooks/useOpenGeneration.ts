import { useCallback, useEffect, useRef } from 'react';

/**
 * Tells whether an answer still belongs to the dialog's current opening. A
 * dry run does not hold a dialog open, so its answer can arrive after the
 * person closed the dialog, or closed and reopened it, and is then dropped.
 *
 * ```ts
 * const isCurrent = startAnswer();
 * const plan = await write.dryRun(input);
 * if (isCurrent()) setPlan(plan);
 * ```
 */
export function useOpenGeneration(isOpen: boolean): () => () => boolean {
  const generation = useRef(0);
  useEffect(() => {
    if (!isOpen) {
      generation.current += 1;
    }
  }, [isOpen]);
  return useCallback(() => {
    const started = generation.current;
    return () => generation.current === started;
  }, []);
}
