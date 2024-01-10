import React from 'react';
import {
  Grid,
} from "@material-ui/core";
import { useInstallations, useInstallationsStatuses } from '../hooks';
import { InstallationsErrors } from '../InstallationsErrors';
import { InstallationsSelector } from '../InstallationsSelector';
import { EmptyState } from '@backstage/core-components';

type InstallationsWrapperProps = {
  children: React.ReactNode;
};

export const InstallationsWrapper = ({ children }: InstallationsWrapperProps) => {
  const {
    installations,
    selectedInstallations,
    setSelectedInstallations,
  } = useInstallations();

  const {
    installationsStatuses,
  } = useInstallationsStatuses(selectedInstallations);

  const errors = installationsStatuses.some((installationStatus) => installationStatus.isError);

  const handleSelectedInstallationsChange = (selectedItems: string[]) => {
    setSelectedInstallations(selectedItems);
  }

  return (
    <Grid container spacing={3} direction="column">
      <Grid item>
        <InstallationsSelector
          installations={installations}
          selectedInstallations={selectedInstallations}
          installationsStatuses={installationsStatuses}
          onChange={handleSelectedInstallationsChange}
        />
      </Grid>
      {errors && (
        <Grid item>
          <InstallationsErrors
            installationsStatuses={installationsStatuses}
          />
        </Grid>
      )}
      <Grid item>
        {selectedInstallations.length === 0 ? (
          <EmptyState
            missing="data"
            title="No Installations Selected"
            description="Please select one or more installations."
          />
        ) : children }
      </Grid>
    </Grid>
  );
};
