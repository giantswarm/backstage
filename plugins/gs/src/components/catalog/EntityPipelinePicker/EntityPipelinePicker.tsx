import { EntityCheckboxesPicker } from '../EntityCheckboxesPicker';
import { EntityPipelineFilter } from '../filters';

export const EntityPipelinePicker = (props: { initialFilter?: string[] }) => {
  const { initialFilter = [] } = props;

  return (
    <EntityCheckboxesPicker
      label="Pipeline"
      name="pipelines"
      path="metadata.labels.giantswarm.io/pipeline"
      Filter={EntityPipelineFilter}
      initialSelectedOptions={initialFilter}
    />
  );
};
