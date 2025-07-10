import { FormControlLabel, FormGroup, Switch } from '@material-ui/core';

type CompactViewSwitchProps = {
  value: boolean;
  onChange: () => void;
};

export const CompactViewSwitch = ({
  value,
  onChange,
}: CompactViewSwitchProps) => {
  return (
    <FormGroup>
      <FormControlLabel
        control={<Switch checked={value} onChange={onChange} />}
        label="Show only Flux resources"
      />
    </FormGroup>
  );
};
