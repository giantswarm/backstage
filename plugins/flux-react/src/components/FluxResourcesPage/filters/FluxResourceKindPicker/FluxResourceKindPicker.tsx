import { useMemo } from 'react';
// import uniqBy from 'lodash/uniqBy';
import {
  FluxResourceData,
  useFluxResourcesData,
} from '../../../FluxResourcesDataProvider';
// import { FluxResourceKindFilter } from '../../../FluxResourcesDataProvider/utils';

const TITLE = 'Resource Type';

const FLUX_RESOURCE_LABELS = {
  Kustomization: 'Kustomization',
  HelmRelease: 'Helm Release',
  GitRepository: 'Git Repository',
  OCIRepository: 'OCI Repository',
  HelmRepository: 'Helm Repository',
};

// function formatOption(
//   item: FluxResourceData,
// ): MultiplePickerOption | undefined {
//   const label = FLUX_RESOURCE_LABELS[item.resourceType] || item.resourceType;
//   const value = item.resourceType;

//   return { value, label };
// }

export const FluxResourceKindPicker = () => {
  // const {
  //   data,
  //   updateFilters,
  //   filters,
  //   queryParameters: { resourceKind: queryParameter },
  // } = useFluxResourcesData();
  // const options = useMemo(() => {
  //   const allOptions = data
  //     .map(item => formatOption(item))
  //     .filter(item => Boolean(item)) as MultiplePickerOption[];
  //   return uniqBy(allOptions, 'value').sort((a, b) =>
  //     a.label.localeCompare(b.label),
  //   );
  // }, [data]);
  // const handleSelect = (selectedValues: string[]) => {
  //   updateFilters({
  //     resourceKind: new FluxResourceKindFilter(selectedValues),
  //   });
  // };
  // return (
  //   <MultiplePicker
  //     label={TITLE}
  //     queryParameter={queryParameter}
  //     filterValue={filters.resourceKind?.values}
  //     options={options}
  //     onSelect={handleSelect}
  //   />
  // );
};
