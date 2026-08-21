import { EntityCheckboxesPicker } from '../EntityCheckboxesPicker';
import { EntityReadinessFilter } from '../filters';

/**
 * Display labels for the raw verdict values, and the order they appear in.
 *
 * Blocked first, to match the column's sort: a health filter should lead with
 * what needs attention. Capitalised because the column renders "Blocked" and a
 * sidebar reading "blocked" for the same thing looks like a different value.
 */
const readinessLabels: Record<string, string> = {
  blocked: 'Blocked',
  unknown: 'Unknown',
  releasable: 'Releasable',
};

export const EntityReadinessPicker = (props: { initialFilter?: string[] }) => {
  const { initialFilter = [] } = props;

  return (
    <EntityCheckboxesPicker
      label="Release readiness"
      name="readiness"
      path="metadata.labels.giantswarm.io/readiness"
      Filter={EntityReadinessFilter}
      initialSelectedOptions={initialFilter}
      optionsOrder={Object.keys(readinessLabels)}
      renderOption={option => readinessLabels[option] ?? option}
    />
  );
};
