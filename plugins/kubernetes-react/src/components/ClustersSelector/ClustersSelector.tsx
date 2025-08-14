import { Autocomplete } from '@giantswarm/backstage-plugin-ui-react';

type ClustersSelectorProps = {
  clusters: string[];
  selectedClusters: string[];
  onChange?: (selectedClusters: string[]) => void;
};

export const ClustersSelector = ({
  clusters,
  selectedClusters,
  onChange,
}: ClustersSelectorProps) => {
  const handleChange = (newValue: string | string[] | null) => {
    if (!onChange) {
      return;
    }

    onChange(newValue as string[]);
  };

  const items = clusters.map(cluster => ({
    label: cluster,
    value: cluster,
  }));

  return (
    <Autocomplete
      label="Clusters"
      items={items}
      selectedValue={selectedClusters}
      onChange={handleChange}
      multiple
    />
  );
};
