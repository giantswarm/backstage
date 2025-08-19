import { useClustersData } from '../../../ClustersDataProvider';
import { InstallationPicker as InstallationPickerComponent } from '../../../../installations/filters/InstallationPicker';

export const InstallationPicker = () => {
  const { setActiveInstallations } = useClustersData();

  return (
    <InstallationPickerComponent
      onActiveInstallationsChange={setActiveInstallations}
    />
  );
};
