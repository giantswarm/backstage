import { Box } from '@material-ui/core';
import { InstallationsSelector } from '../../InstallationsSelector';
import { useInstallations } from '../../../hooks';

export const InstallationPicker = () => {
  const {
    installations,
    selectedInstallations,
    disabledInstallations,
    setSelectedInstallations,
  } = useInstallations();

  const handleSelectedInstallationsChange = (selectedItems: string[]) => {
    setSelectedInstallations(selectedItems);
  };

  if (installations.length <= 1) {
    return null;
  }

  return (
    <Box pb={1} pt={1}>
      <InstallationsSelector
        installations={installations}
        selectedInstallations={selectedInstallations}
        disabledInstallations={disabledInstallations}
        onChange={handleSelectedInstallationsChange}
      />
    </Box>
  );
};
