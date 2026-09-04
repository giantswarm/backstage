import { EntityCheckboxesPicker } from '../EntityCheckboxesPicker';
import { EntityOrbVersionFilter } from '../filters';
import { compareOrbVersionsDesc } from '../../utils/build';

/**
 * Filters on the architect orb version the default branch declares. The value
 * set is open-ended, so the options are ordered by a comparator rather than a
 * fixed list: newest orb first.
 */
export const EntityOrbVersionPicker = (props: { initialFilter?: string[] }) => {
  const { initialFilter = [] } = props;

  return (
    <EntityCheckboxesPicker
      label="Architect orb"
      name="orbVersions"
      path="metadata.labels.giantswarm.io/architect-orb-version"
      Filter={EntityOrbVersionFilter}
      initialSelectedOptions={initialFilter}
      compareOptions={compareOrbVersionsDesc}
    />
  );
};
