import { useDeploymentsData } from '../../../DeploymentsDataProvider';
import { InstallationPicker as InstallationPickerComponent } from '../../../../installations/filters/InstallationPicker';

export const InstallationPicker = () => {
  const { setActiveInstallations } = useDeploymentsData();

  return (
    <InstallationPickerComponent
      onActiveInstallationsChange={setActiveInstallations}
    />
  );
};
