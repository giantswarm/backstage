import { makeStyles, Theme } from '@material-ui/core';
import Checkbox from '@material-ui/core/Checkbox';
import FormControlLabel from '@material-ui/core/FormControlLabel';
import React, { memo } from 'react';

const useStyles = makeStyles((theme: Theme) => ({
  root: {
    marginRight: 0,
  },
  label: {
    fontSize: theme.typography.body2.fontSize,
  },
}));

interface Props {
  selected: boolean;
  value: string;
  label: string;
}

export const AutocompleteOption = memo((props: Props) => {
  const classes = useStyles();
  const { selected, label, value } = props;

  return (
    <FormControlLabel
      classes={classes}
      control={<Checkbox checked={selected} name={value} size="small" />}
      label={label}
      onClick={event => event.preventDefault()}
    />
  );
});
