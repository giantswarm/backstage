import { act, renderHook } from '@testing-library/react';
import { useVisibleSort } from './useVisibleSort';

const byInstallation = { column: 'installation', direction: 'ascending' } as const;
const byName = { column: 'name', direction: 'ascending' } as const;

describe('useVisibleSort', () => {
  it('uses the default sort while its column shows', () => {
    const { result } = renderHook(() =>
      useVisibleSort(byInstallation, byName, undefined),
    );
    expect(result.current.sort).toEqual(byInstallation);
  });

  it('falls back while the default sort column is hidden, also when it is hidden later', () => {
    const { result, rerender } = renderHook(
      ({ hidden }: { hidden?: string[] }) =>
        useVisibleSort(byInstallation, byName, hidden),
      { initialProps: { hidden: undefined as string[] | undefined } },
    );
    expect(result.current.sort).toEqual(byInstallation);

    rerender({ hidden: ['installation'] });
    expect(result.current.sort).toEqual(byName);
  });

  it('keeps the sort the reader chose, unless its column is hidden', () => {
    const { result, rerender } = renderHook(
      ({ hidden }: { hidden?: string[] }) =>
        useVisibleSort(byInstallation, byName, hidden),
      { initialProps: { hidden: undefined as string[] | undefined } },
    );
    const byStatus = { column: 'status', direction: 'descending' } as const;
    act(() => result.current.onSortChange(byStatus));
    expect(result.current.sort).toEqual(byStatus);

    act(() => result.current.onSortChange(byInstallation));
    rerender({ hidden: ['installation'] });
    expect(result.current.sort).toEqual(byName);
  });
});
