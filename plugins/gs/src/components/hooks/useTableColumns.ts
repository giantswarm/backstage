import { useCallback } from 'react';
import useLocalStorageState from 'use-local-storage-state';

export function useTableColumns(tableName: string) {
  const [savedTableColumns, setSavedTableColumns] = useLocalStorageState<
    string[]
  >(`gs-table-columns-${tableName}`, {
    defaultValue: [],
  });
  const setVisibleColumns = useCallback(
    (columns: string[]) => {
      const itemsToSave = [columns].flat().filter(Boolean) as string[];

      if (
        JSON.stringify(savedTableColumns.sort()) !==
        JSON.stringify(itemsToSave.sort())
      ) {
        setSavedTableColumns(itemsToSave);
      }
    },
    [savedTableColumns, setSavedTableColumns],
  );

  return {
    visibleColumns: savedTableColumns,
    setVisibleColumns,
  };
}
