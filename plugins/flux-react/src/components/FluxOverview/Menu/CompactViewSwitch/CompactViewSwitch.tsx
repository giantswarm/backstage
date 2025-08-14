import {
  FormControlLabel,
  FormGroup,
  makeStyles,
  Switch,
} from '@material-ui/core';

const useStyles = makeStyles(() => ({
  root: {
    display: 'inline-flex',
  },
}));

type CompactViewSwitchProps = {
  value: boolean;
  onChange: () => void;
};

export const CompactViewSwitch = ({
  value,
  onChange,
}: CompactViewSwitchProps) => {
  const classes = useStyles();

  return (
    <FormGroup className={classes.root}>
      <FormControlLabel
        control={<Switch checked={value} onChange={onChange} />}
        label="Show only Flux resources"
      />
    </FormGroup>
  );
};
