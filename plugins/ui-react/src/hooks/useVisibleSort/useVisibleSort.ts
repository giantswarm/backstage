import { useState } from 'react';
import type { SortDescriptor } from '@backstage/ui';

/**
 * A controlled sort for a bui `useTable` whose columns can be hidden: the one
 * the reader chose by clicking a header, else `defaultSort` — or `fallbackSort`
 * while the default's column is hidden, so the order always follows a header
 * that shows its arrow. A chosen sort on a column that gets hidden falls back
 * the same way.
 *
 * Pass the result as `useTable({ sort, onSortChange })` instead of
 * `initialSort`: an initial sort is read once, and the hidden columns are
 * often decided only after the first render.
 */
export function useVisibleSort(
  defaultSort: SortDescriptor,
  fallbackSort: SortDescriptor,
  hiddenColumns: ReadonlyArray<string> | undefined,
): { sort: SortDescriptor; onSortChange: (sort: SortDescriptor) => void } {
  const [chosen, setChosen] = useState<SortDescriptor>();
  const isHidden = (sort: SortDescriptor) =>
    hiddenColumns?.includes(String(sort.column)) ?? false;

  let sort = isHidden(defaultSort) ? fallbackSort : defaultSort;
  if (chosen && !isHidden(chosen)) {
    sort = chosen;
  }
  return { sort, onSortChange: setChosen };
}
