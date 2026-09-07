import { StatusPicker } from '../StatusPicker';
import { NamespacePicker } from '../NamespacePicker';
import { SourcePicker } from '../SourcePicker';

export const WorkflowsFilters = () => {
  return (
    <>
      <StatusPicker />
      <NamespacePicker />
      <SourcePicker />
    </>
  );
};
