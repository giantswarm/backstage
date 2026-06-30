import { InstallationPicker } from '../../InstallationPicker';
import { StatusPicker } from './StatusPicker';
import { NamespacePicker } from './NamespacePicker';

export const WorkflowsFilters = () => {
  return (
    <>
      <InstallationPicker />
      <StatusPicker />
      <NamespacePicker />
    </>
  );
};
