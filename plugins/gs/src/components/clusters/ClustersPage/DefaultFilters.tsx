import React from 'react';
import { InstallationsPicker } from '../../InstallationsPicker';
import { useInstallations } from '../../hooks';
import { KindPicker } from './filters/KindPicker';
import { OrganizationPicker } from './filters/OrganizationPicker';
import { ReleaseVersionPicker } from './filters/ReleaseVersionPicker/ReleaseVersionPicker';
import { StatusPicker } from './filters/StatusPicker';
import { KubernetesVersionPicker } from './filters/KubernetesVersionPicker';
import { AppVersionPicker } from './filters/AppVersionPicker';
import { LocationPicker } from './filters/LocationPicker';

export const DefaultFilters = () => {
  const { installations, selectedInstallations, setSelectedInstallations } =
    useInstallations();

  const handleSelectedInstallationsChange = (selectedItems: string[]) => {
    setSelectedInstallations(selectedItems);
  };

  return (
    <>
      <InstallationsPicker
        installations={installations}
        selectedInstallations={selectedInstallations}
        onChange={handleSelectedInstallationsChange}
      />
      <LocationPicker />
      <KindPicker />
      <OrganizationPicker />
      <StatusPicker />
      <AppVersionPicker />
      <ReleaseVersionPicker />
      <KubernetesVersionPicker />
    </>
  );
};
