import { Box } from '@material-ui/core';
import { Autocomplete } from '@giantswarm/backstage-plugin-ui-react';
import { useMusterInstance } from '../MusterInstanceProvider';

/**
 * Single-select picker over the muster installations ONLY. The list is sourced
 * from the MusterInstanceProvider, which derives it from the backend's
 * config-driven installation set -- so an MC that runs no muster aggregator can
 * never appear here. Switching the picker re-scopes the whole muster section to
 * the chosen instance.
 */
export const InstallationPicker = () => {
  const {
    installations,
    activeInstallation,
    setActiveInstallation,
    isLoadingInstallations,
  } = useMusterInstance();

  if (isLoadingInstallations || installations.length === 0) {
    return null;
  }

  const items = installations.map(name => ({ label: name, value: name }));

  return (
    <Box py={1} maxWidth={320}>
      <Autocomplete
        label="Installation"
        items={items}
        selectedValue={activeInstallation ?? null}
        onChange={value => {
          if (value) {
            setActiveInstallation(value);
          }
        }}
      />
    </Box>
  );
};
