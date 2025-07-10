import { useEffect, useState } from 'react';
import useDebounce from 'react-use/esm/useDebounce';
import { useLocation } from 'react-router-dom';
import qs from 'qs';
import { Autocomplete } from '../UI/Autocomplete';

type ClusterSelectorProps = {
  clusters: string[];
  selectedCluster: string | null;
  onChange?: (selectedCluster: string | null) => void;
};

export const ClusterSelector = ({
  clusters,
  selectedCluster,
  onChange,
}: ClusterSelectorProps) => {
  const [value, setValue] = useState<string | null>(selectedCluster);

  const location = useLocation();
  useEffect(() => {
    const parsed = qs.parse(location.search, {
      ignoreQueryPrefix: true,
    });
    const queryParameter = parsed.cluster as string | undefined;
    if (queryParameter) {
      setValue(queryParameter);
    }
  }, [location.search]);

  useDebounce(
    () => {
      if (onChange && value !== selectedCluster) {
        onChange(value);
      }
    },
    10,
    [value],
  );

  const handleChange = (newValue: string | string[] | null) => {
    if (Array.isArray(newValue)) {
      setValue(newValue[0] ?? null);
    } else {
      setValue(newValue);
    }
  };

  const items = clusters.map(cluster => ({
    label: cluster,
    value: cluster,
  }));

  return (
    <Autocomplete
      label="Cluster"
      items={items}
      selectedValue={selectedCluster}
      onChange={handleChange}
    />
  );
};
