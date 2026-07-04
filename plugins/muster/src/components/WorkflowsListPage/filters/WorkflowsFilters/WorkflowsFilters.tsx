import { InstallationPicker } from '../../../InstallationPicker';
import { StatusPicker } from '../StatusPicker';
import { NamespacePicker } from '../NamespacePicker';
import { SourcePicker } from '../SourcePicker';

export const WorkflowsFilters = () => {
  return (
    <>
      <InstallationPicker fullWidth />
      <StatusPicker />
      <NamespacePicker />
      <SourcePicker />
    </>
  );
};
