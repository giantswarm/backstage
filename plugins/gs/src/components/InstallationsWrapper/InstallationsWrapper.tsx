import { Grid, makeStyles } from '@material-ui/core';
import { useInstallations, useInstallationsStatuses } from '../hooks';
import { InstallationsSelector } from '../InstallationsSelector';

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
  const {
    installations,
    selectedInstallations,
    activeInstallations,
    disabledInstallations,
    setSelectedInstallations,
  } = useInstallations();

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
          activeInstallations={activeInstallations}
          disabledInstallations={disabledInstallations}
          installationsStatuses={installationsStatuses}
          multiple
          onChange={handleSelectedInstallationsChange}
        />
      </Grid>
      <Grid item className={classes.fullWidth}>
        {children}
      </Grid>
    </Grid>
  );
};
