import {
  MenuItem,
  TextField,
  Typography,
  makeStyles,
  Theme,
} from '@material-ui/core';
import { RoadmapField } from '../../apis';

const NOT_SET = '';

const useStyles = makeStyles((theme: Theme) => ({
  readOnlyValue: {
    marginBottom: theme.spacing(2),
  },
}));

/**
 * Inline editor for one board field on the detail page. Single-select and
 * iteration fields render as dropdowns over the schema's values, date
 * fields as a date input; anything else is read-only (the backend rejects
 * updates to other field types anyway).
 */
export function FieldEditor(props: {
  field: RoadmapField;
  value: string | undefined;
  disabled: boolean;
  onChange: (value: string) => void;
}) {
  const { field, value, disabled, onChange } = props;
  const classes = useStyles();

  const values = field.options ?? field.iterations ?? [];
  const editable =
    field.type === 'singleSelect' ||
    field.type === 'iteration' ||
    field.type === 'date';

  if (!editable) {
    return (
      <div className={classes.readOnlyValue}>
        <Typography variant="caption" color="textSecondary">
          {field.name}
        </Typography>
        <Typography variant="body2">{value ?? 'Not set'}</Typography>
      </div>
    );
  }

  if (field.type === 'date') {
    return (
      <TextField
        fullWidth
        size="small"
        variant="outlined"
        margin="dense"
        type="date"
        label={field.name}
        value={value ?? NOT_SET}
        disabled={disabled}
        InputLabelProps={{ shrink: true }}
        onChange={event => {
          if (event.target.value) {
            onChange(event.target.value);
          }
        }}
      />
    );
  }

  // The board's current value may not be among the schema's values (e.g. a
  // past iteration); keep it selectable so the control shows the truth.
  const selectValues =
    value && !values.includes(value) ? [value, ...values] : values;

  return (
    <TextField
      fullWidth
      select
      size="small"
      variant="outlined"
      margin="dense"
      label={field.name}
      value={value ?? NOT_SET}
      disabled={disabled}
      onChange={event => {
        if (event.target.value !== NOT_SET) {
          onChange(event.target.value);
        }
      }}
    >
      {!value && (
        <MenuItem value={NOT_SET} disabled>
          Not set
        </MenuItem>
      )}
      {selectValues.map(option => (
        <MenuItem key={option} value={option}>
          {option}
        </MenuItem>
      ))}
    </TextField>
  );
}
