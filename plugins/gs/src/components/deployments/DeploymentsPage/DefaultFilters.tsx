import React from 'react';
import { InstallationsPicker } from '../../InstallationsPicker';
import { useInstallations } from '../../hooks';
import { KindPicker } from './filters/KindPicker';
import { TargetClusterPicker } from './filters/TargetClusterPicker';
import { TargetClusterKindPicker } from './filters/TargetClusterKindPicker';
import { VersionPicker } from './filters/VersionPicker';
import { NamespacePicker } from './filters/NamespacePicker';
import { StatusPicker } from './filters/StatusPicker';
import { LabelPicker } from './filters/LabelPicker';
import { AppPicker } from './filters/AppPicker';

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
      <AppPicker />
      <VersionPicker />
      <TargetClusterPicker />
      <NamespacePicker />
      <TargetClusterKindPicker />
      <LabelPicker />
      <StatusPicker />
      <KindPicker />
    </>
  );
};
