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
