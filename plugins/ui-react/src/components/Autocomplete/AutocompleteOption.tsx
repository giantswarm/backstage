import { makeStyles, Radio, Theme } from '@material-ui/core';
import Checkbox from '@material-ui/core/Checkbox';
import FormControlLabel from '@material-ui/core/FormControlLabel';
import { memo, ReactNode } from 'react';

const useStyles = makeStyles((theme: Theme) => ({
  root: {
    marginRight: 0,
  },
  label: {
    fontSize: theme.typography.body2.fontSize,
    overflow: 'hidden',
    whiteSpace: 'nowrap',
    textOverflow: 'ellipsis',
  },
}));

interface Props {
  selected: boolean;
  value: string;
  label: ReactNode;
  multiple?: true;
}

export const AutocompleteOption = memo((props: Props) => {
  const classes = useStyles();
  const { selected, label, value } = props;

  return props.multiple ? (
    <FormControlLabel
      classes={classes}
      control={
        props.multiple ? (
          <Checkbox checked={selected} name={value} size="small" />
        ) : (
          <Radio checked={selected} name={value} size="small" />
        )
      }
      label={label}
      onClick={event => event.preventDefault()}
    />
  ) : (
    value
  );
});
