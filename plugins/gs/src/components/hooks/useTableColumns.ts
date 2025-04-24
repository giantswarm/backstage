import { useCallback } from 'react';
import useLocalStorageState from 'use-local-storage-state';

export const DEPLOYMENTS_TABLE_ID = 'deployments';
export const ENTITY_DEPLOYMENTS_TABLE_ID = 'entity-deployments';
export const CLUSTERS_TABLE_ID = 'clusters';

export function useTableColumns(tableName: string) {
  const [savedTableColumns, setSavedTableColumns] = useLocalStorageState<
    string[]
  >(`gs-table-columns-${tableName}`, {
    defaultValue: [],
  });
  const saveVisibleColumns = useCallback(
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
    saveVisibleColumns,
  };
}
