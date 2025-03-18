import React from 'react';
import { Grid, makeStyles } from '@material-ui/core';
import { useInstallations, useInstallationsStatuses } from '../hooks';
import { InstallationsSelector } from '../InstallationsSelector';
import { EmptyState } from '@backstage/core-components';

export const useStyles = makeStyles({
  fullWidth: {
    maxWidth: '100%',
  },
  installationsSelectorContainer: {
    maxWidth: 350,
  },
});

type InstallationsWrapperProps = {
  children: React.ReactNode;
};

export const InstallationsWrapper = ({
  children,
}: InstallationsWrapperProps) => {
  const { installations, selectedInstallations, setSelectedInstallations } =
    useInstallations();

  const { installationsStatuses } = useInstallationsStatuses();

  const classes = useStyles();

  const handleSelectedInstallationsChange = (selectedItems: string[]) => {
    setSelectedInstallations(selectedItems);
  };

  return (
    <Grid container spacing={3} direction="column">
      <Grid item className={classes.installationsSelectorContainer}>
        <InstallationsSelector
          installations={installations}
          selectedInstallations={selectedInstallations}
          installationsStatuses={installationsStatuses}
          multiple
          onChange={handleSelectedInstallationsChange}
        />
      </Grid>
      <Grid item className={classes.fullWidth}>
        {selectedInstallations.length === 0 ? (
          <EmptyState
            missing="data"
            title="No Installations Selected"
            description="Please select one or more installations."
          />
        ) : (
          children
        )}
      </Grid>
    </Grid>
  );
};
