import { Grid, makeStyles } from '@material-ui/core';
import { useInstallations } from '../hooks';
import { InstallationsSelector } from '../installations/InstallationsSelector';

export const useStyles = makeStyles({
  fullWidth: {
    maxWidth: '100%',
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
    disabledInstallations,
    setSelectedInstallations,
  } = useInstallations();

  const classes = useStyles();

  const handleSelectedInstallationsChange = (selectedItems: string[]) => {
    setSelectedInstallations(selectedItems);
  };

  return (
    <Grid container spacing={3} direction="column">
      <Grid item>
        <InstallationsSelector
          installations={installations}
          selectedInstallations={selectedInstallations}
          disabledInstallations={disabledInstallations}
          onChange={handleSelectedInstallationsChange}
        />
      </Grid>
      <Grid item className={classes.fullWidth}>
        {children}
      </Grid>
    </Grid>
  );
};
