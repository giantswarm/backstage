import {
  Resource,
  ResourceObject,
} from '@giantswarm/backstage-plugin-gs-common';
import { useEffect, useMemo, useState } from 'react';

export function useResourcePicker<T extends ResourceObject>({
  resources,
  isLoading,
  getResourceName,
  initialValue,
  selectFirstValue = false,
  onSelect,
  compareFn,
}: {
  resources: Resource<T>[];
  isLoading: boolean;
  getResourceName: (resource: Resource<T>) => string;
  initialValue?: string;
  selectFirstValue?: boolean;
  onSelect: (selectedResource: Resource<T> | undefined) => void;
  compareFn?: ((a: string, b: string) => number) | undefined;
}) {
  const resourceNames = useMemo(
    () => resources.map(getResourceName).sort(compareFn),
    [resources, getResourceName, compareFn],
  );

  const defaultValue = selectFirstValue ? resourceNames[0] : undefined;
  const [selectedName, setSelectedName] = useState<string | undefined>(
    initialValue ?? defaultValue,
  );

  // Selection sync logic
  useEffect(() => {
    if (
      !selectedName ||
      (!isLoading && selectedName && !resourceNames.includes(selectedName))
    ) {
      if (selectFirstValue) {
        setSelectedName(resourceNames[0]);
      } else {
        setSelectedName(undefined);
      }
    }
  }, [isLoading, resourceNames, selectFirstValue, selectedName]);

  // Propagate selection change
  useEffect(() => {
    const selectedResource = resources.find(
      resource => getResourceName(resource) === selectedName,
    );
    onSelect(selectedResource);
  }, [resources, selectedName, onSelect, getResourceName]);

  return {
    selectedName,
    resourceNames,
    handleChange: (selectedItem: string) => setSelectedName(selectedItem),
  };
}
