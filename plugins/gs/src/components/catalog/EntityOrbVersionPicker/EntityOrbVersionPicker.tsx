import { EntitySortedAutocompletePicker } from '../EntitySortedAutocompletePicker';
import { EntityOrbVersionFilter } from '../filters';
import { compareOrbVersionsDesc } from '../../utils/build';

/**
 * Filters on the architect orb version the default branch declares. The value
 * set is open-ended, so it is a dropdown rather than checkboxes, with the
 * newest orb first.
 */
export const EntityOrbVersionPicker = (props: { initialFilter?: string[] }) => {
  const { initialFilter = [] } = props;

  return (
    <EntitySortedAutocompletePicker
      label="Architect Orb Version"
      name="orbVersions"
      path="metadata.labels.giantswarm.io/architect-orb-version"
      Filter={EntityOrbVersionFilter}
      initialSelectedOptions={initialFilter}
      compareOptions={compareOrbVersionsDesc}
    />
  );
};
