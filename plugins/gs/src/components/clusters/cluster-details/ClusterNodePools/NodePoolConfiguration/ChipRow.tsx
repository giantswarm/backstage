import { makeStyles } from '@material-ui/core';
import { Chip } from './Chip';

const DEFAULT_LIMIT = 10;

const useStyles = makeStyles({
  root: {
    display: 'inline-flex',
    flexWrap: 'wrap',
    gap: 'var(--bui-space-1)',
    alignItems: 'center',
  },
});

interface ChipRowProps {
  values: string[];
  variant?: 'include' | 'exclude';
  limit?: number;
}

export const ChipRow = ({
  values,
  variant = 'include',
  limit = DEFAULT_LIMIT,
}: ChipRowProps) => {
  const classes = useStyles();
  const shown = values.slice(0, limit);
  const hidden = values.length - shown.length;

  return (
    <span className={classes.root} title={values.join(', ')}>
      {shown.map(value => (
        <Chip key={value} variant={variant}>
          {value}
        </Chip>
      ))}
      {hidden > 0 && <Chip variant={variant}>{`+${hidden}`}</Chip>}
    </span>
  );
};
