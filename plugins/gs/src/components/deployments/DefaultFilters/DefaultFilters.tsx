import React from 'react';
import { InstallationsPicker } from '../../InstallationsPicker';
import { useInstallations } from '../../hooks';
import { KindPicker } from '../DeploymentsPage/filters/KindPicker';

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
      <KindPicker />
    </>
  );
};
