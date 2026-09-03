import { EntityCheckboxesPicker } from '../EntityCheckboxesPicker';
import { EntityReadinessFilter } from '../filters';
import { READINESS_ORDER, readinessLabel } from '../../utils/readiness';

export const EntityReadinessPicker = (props: { initialFilter?: string[] }) => {
  const { initialFilter = [] } = props;

  return (
    <EntityCheckboxesPicker
      label="Release readiness"
      name="readiness"
      path="metadata.labels.giantswarm.io/readiness"
      Filter={EntityReadinessFilter}
      initialSelectedOptions={initialFilter}
      optionsOrder={READINESS_ORDER}
      renderOption={readinessLabel}
    />
  );
};
