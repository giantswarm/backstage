import {
  Box,
  Button,
  FormControlLabel,
  IconButton,
  Link,
  MenuItem,
  Switch,
  TextField,
  Tooltip,
  Typography,
  makeStyles,
  Theme,
} from '@material-ui/core';
import AddIcon from '@material-ui/icons/Add';
import DeleteOutlineIcon from '@material-ui/icons/DeleteOutline';
import { fieldKind, FormValue, SchemaField } from '../../lib/schemaForm';

const useStyles = makeStyles((theme: Theme) => ({
  field: {
    marginBottom: theme.spacing(2),
  },
  argType: {
    color: theme.palette.text.secondary,
    fontSize: '0.75rem',
  },
  arrayHeader: {
    display: 'flex',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    marginBottom: theme.spacing(0.5),
  },
  arrayRow: {
    display: 'flex',
    alignItems: 'center',
    gap: theme.spacing(1),
    marginBottom: theme.spacing(1),
  },
  helper: {
    marginTop: theme.spacing(0.5),
    display: 'block',
  },
  error: {
    color: theme.palette.error.main,
  },
}));

function helperFor(field: SchemaField, error?: string): string | undefined {
  if (error) {
    return error;
  }
  if (field.description) {
    return field.description;
  }
  if (field.default !== undefined) {
    return `Default: ${JSON.stringify(field.default)}`;
  }
  return undefined;
}

function ArrayField({
  field,
  value,
  error,
  jsonMode,
  onChange,
  onToggleJson,
}: {
  field: SchemaField;
  value: FormValue | undefined;
  error?: string;
  jsonMode: boolean;
  onChange: (value: FormValue) => void;
  onToggleJson: () => void;
}) {
  const classes = useStyles();
  const rows = Array.isArray(value) ? value : [];

  const setRow = (index: number, next: string) => {
    const copy = [...rows];
    copy[index] = next;
    onChange(copy);
  };
  const addRow = () => onChange([...rows, '']);
  const removeRow = (index: number) =>
    onChange(rows.filter((_, i) => i !== index));

  return (
    <Box className={classes.field}>
      <Box className={classes.arrayHeader}>
        <Typography variant="body2">
          {field.name}
          {field.required ? ' *' : ''}{' '}
          <span className={classes.argType}>
            (array of {field.itemType ?? 'string'})
          </span>
        </Typography>
        <Link
          component="button"
          type="button"
          variant="caption"
          onClick={onToggleJson}
        >
          {jsonMode ? 'Edit as rows' : 'Edit as JSON'}
        </Link>
      </Box>

      {jsonMode ? (
        <TextField
          fullWidth
          multiline
          minRows={3}
          variant="outlined"
          size="small"
          placeholder='["a", "b"]'
          error={Boolean(error)}
          value={typeof value === 'string' ? value : ''}
          onChange={e => onChange(e.target.value)}
        />
      ) : (
        <>
          {rows.map((row, index) => (
            <Box key={index} className={classes.arrayRow}>
              {field.itemEnumValues && field.itemEnumValues.length > 0 ? (
                <TextField
                  select
                  fullWidth
                  size="small"
                  variant="outlined"
                  value={row}
                  onChange={e => setRow(index, e.target.value)}
                >
                  {field.itemEnumValues.map(option => {
                    const v = String(option);
                    return (
                      <MenuItem key={v} value={v}>
                        {v}
                      </MenuItem>
                    );
                  })}
                </TextField>
              ) : (
                <TextField
                  fullWidth
                  size="small"
                  variant="outlined"
                  type={field.itemType === 'number' ? 'number' : 'text'}
                  value={row}
                  onChange={e => setRow(index, e.target.value)}
                />
              )}
              <Tooltip title="Remove">
                <IconButton size="small" onClick={() => removeRow(index)}>
                  <DeleteOutlineIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            </Box>
          ))}
          <Button
            size="small"
            startIcon={<AddIcon />}
            onClick={addRow}
            variant="outlined"
          >
            Add item
          </Button>
        </>
      )}

      {(error || field.description) && (
        <Typography
          variant="caption"
          className={`${classes.helper} ${error ? classes.error : ''}`}
          color={error ? 'error' : 'textSecondary'}
        >
          {error ?? field.description}
        </Typography>
      )}
    </Box>
  );
}

export interface ToolArgFieldProps {
  field: SchemaField;
  value: FormValue | undefined;
  error?: string;
  jsonMode: boolean;
  onChange: (value: FormValue) => void;
  onToggleJson: () => void;
}

/**
 * Renders one tool argument with a widget chosen from its JSON-schema type:
 * switch (boolean), select (enum), number stepper, editable rows or a JSON-paste
 * textarea (array/object), or a text field — each with the arg description as
 * helper text and inline validation errors.
 */
export function ToolArgField({
  field,
  value,
  error,
  jsonMode,
  onChange,
  onToggleJson,
}: ToolArgFieldProps) {
  const classes = useStyles();
  const kind = fieldKind(field);

  if (kind === 'boolean') {
    return (
      <FormControlLabel
        className={classes.field}
        control={
          <Switch
            color="primary"
            checked={Boolean(value ?? field.default ?? false)}
            onChange={e => onChange(e.target.checked)}
          />
        }
        label={
          <>
            {field.name}
            {field.required ? ' *' : ''}{' '}
            <span className={classes.argType}>
              {field.description ?? 'boolean'}
            </span>
          </>
        }
      />
    );
  }

  if (kind === 'array') {
    return (
      <ArrayField
        field={field}
        value={value}
        error={error}
        jsonMode={jsonMode}
        onChange={onChange}
        onToggleJson={onToggleJson}
      />
    );
  }

  const helperText = helperFor(field, error);

  if (kind === 'enum') {
    return (
      <TextField
        select
        className={classes.field}
        fullWidth
        variant="outlined"
        size="small"
        required={field.required}
        label={`${field.name} (${field.type})`}
        helperText={helperText}
        error={Boolean(error)}
        value={(value as string | undefined) ?? ''}
        onChange={e => onChange(e.target.value)}
      >
        <MenuItem value="">
          <em>unset</em>
        </MenuItem>
        {(field.enumValues ?? []).map(option => {
          const v = String(option);
          return (
            <MenuItem key={v} value={v}>
              {v}
            </MenuItem>
          );
        })}
      </TextField>
    );
  }

  const isJson = kind === 'json';
  return (
    <TextField
      className={classes.field}
      fullWidth
      variant="outlined"
      size="small"
      type={kind === 'number' ? 'number' : 'text'}
      multiline={isJson}
      minRows={isJson ? 3 : undefined}
      required={field.required}
      label={`${field.name} (${field.type})`}
      placeholder={isJson ? '{ }' : undefined}
      helperText={helperText}
      error={Boolean(error)}
      value={(value as string | undefined) ?? ''}
      onChange={e => onChange(e.target.value)}
    />
  );
}
