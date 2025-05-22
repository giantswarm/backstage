import { InstallationsPicker } from '../../InstallationsPicker';
import { useInstallations } from '../../hooks';
import { KindPicker } from './filters/KindPicker';
import { OrganizationPicker } from './filters/OrganizationPicker';
import { ReleaseVersionPicker } from './filters/ReleaseVersionPicker';
import { StatusPicker } from './filters/StatusPicker';
import { KubernetesVersionPicker } from './filters/KubernetesVersionPicker';
import { AppVersionPicker } from './filters/AppVersionPicker';
import { LocationPicker } from './filters/LocationPicker';
import { ProviderPicker } from './filters/ProviderPicker';
import { LabelPicker } from './filters/LabelPicker';
import { Box } from '@material-ui/core';

export const DefaultFilters = () => {
  const {
    installations,
    selectedInstallations,
    disabledInstallations,
    setSelectedInstallations,
  } = useInstallations();

  const handleSelectedInstallationsChange = (selectedItems: string[]) => {
    setSelectedInstallations(selectedItems);
  };

  return (
    <>
      <Box pb={1} pt={1}>
        <InstallationsPicker
          installations={installations}
          selectedInstallations={selectedInstallations}
          disabledInstallations={disabledInstallations}
          onChange={handleSelectedInstallationsChange}
        />
      </Box>
      <ProviderPicker />
      <LocationPicker />
      <KindPicker />
      <OrganizationPicker />
      <LabelPicker />
      <StatusPicker />
      <AppVersionPicker />
      <ReleaseVersionPicker />
      <KubernetesVersionPicker />
    </>
  );
};
