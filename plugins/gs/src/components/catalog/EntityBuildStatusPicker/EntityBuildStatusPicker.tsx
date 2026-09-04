import { EntityCheckboxesPicker } from '../EntityCheckboxesPicker';
import { EntityBuildStatusFilter } from '../filters';
import { BUILD_STATUS_ORDER, buildStatusLabel } from '../../utils/build';

export const EntityBuildStatusPicker = (props: {
  initialFilter?: string[];
}) => {
  const { initialFilter = [] } = props;

  return (
    <EntityCheckboxesPicker
      label="Build"
      name="buildStatus"
      path="metadata.labels.giantswarm.io/build-status"
      Filter={EntityBuildStatusFilter}
      initialSelectedOptions={initialFilter}
      optionsOrder={BUILD_STATUS_ORDER}
      renderOption={buildStatusLabel}
    />
  );
};
