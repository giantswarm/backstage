import React from 'react';
import { EntityCheckboxesPicker } from '../EntityCheckboxesPicker';
import { EntityProviderFilter } from '../filters';

const providerLabels: Record<string, string> = {
  capa: 'CAPA',
  capv: 'CAPV',
  capz: 'CAPZ',
  aws: 'AWS vintage',
  'cloud-director': 'Cloud Director',
  vsphere: 'VSphere',
  kvm: 'KVM',
};

export const EntityProviderPicker = (props: { initialFilter?: string[] }) => {
  const { initialFilter = [] } = props;

  return (
    <EntityCheckboxesPicker
      label="Provider"
      name="providers"
      path="metadata.labels.giantswarm.io/provider"
      Filter={EntityProviderFilter}
      initialSelectedOptions={initialFilter}
      optionsOrder={Object.keys(providerLabels)}
      renderOption={option => providerLabels[option] ?? option}
    />
  );
};
