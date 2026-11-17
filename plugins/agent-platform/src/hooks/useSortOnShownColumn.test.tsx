import { renderHook } from '@testing-library/react';
import type { ColumnConfig, SortDescriptor } from '@backstage/ui';
import { useSortOnShownColumn } from './useSortOnShownColumn';

type Row = { id: string };
const column = (id: string, isHidden = false): ColumnConfig<Row> => ({
  id,
  label: id,
  cell: () => <span />,
  isHidden,
});
const fallback: SortDescriptor = { column: 'cost', direction: 'descending' };

describe('useSortOnShownColumn', () => {
  it('sorts by the fallback when the sorted column is hidden', () => {
    const onSortChange = jest.fn();
    renderHook(() =>
      useSortOnShownColumn(
        {
          descriptor: { column: 'turns', direction: 'ascending' },
          onSortChange,
        },
        [column('name'), column('turns', true), column('cost')],
        fallback,
      ),
    );
    expect(onSortChange).toHaveBeenCalledWith(fallback);
  });

  it('leaves a sort on a shown column alone', () => {
    const onSortChange = jest.fn();
    renderHook(() =>
      useSortOnShownColumn(
        {
          descriptor: { column: 'turns', direction: 'ascending' },
          onSortChange,
        },
        [column('name'), column('turns'), column('cost')],
        fallback,
      ),
    );
    expect(onSortChange).not.toHaveBeenCalled();
  });

  it('does not switch to a fallback that is hidden too', () => {
    const onSortChange = jest.fn();
    renderHook(() =>
      useSortOnShownColumn(
        {
          descriptor: { column: 'turns', direction: 'ascending' },
          onSortChange,
        },
        [column('name'), column('turns', true), column('cost', true)],
        fallback,
      ),
    );
    expect(onSortChange).not.toHaveBeenCalled();
  });
});
