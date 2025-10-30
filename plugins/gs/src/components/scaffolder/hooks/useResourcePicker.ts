import { KubeObject } from '@giantswarm/backstage-plugin-kubernetes-react';
import { useEffect, useMemo, useState } from 'react';

export function useResourcePicker<T extends KubeObject>({
  resources,
  isLoading,
  getResourceName,
  initialValue,
  selectFirstValue = false,
  onSelect,
  compareFn,
}: {
  resources: T[];
  isLoading: boolean;
  getResourceName?: (resource: T) => string;
  initialValue?: string;
  selectFirstValue?: boolean;
  onSelect: (selectedResource: T | undefined) => void;
  compareFn?: ((a: string, b: string) => number) | undefined;
}) {
  const resourceNames = useMemo(
    () =>
      resources
        .map(resource =>
          getResourceName ? getResourceName(resource) : resource.getName(),
        )
        .sort(compareFn),
    [resources, compareFn, getResourceName],
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
      resource =>
        (getResourceName ? getResourceName(resource) : resource.getName()) ===
        selectedName,
    );
    onSelect(selectedResource);
  }, [resources, selectedName, onSelect, getResourceName]);

  return {
    selectedName,
    resourceNames,
    handleChange: (selectedItem: string) => setSelectedName(selectedItem),
  };
}
