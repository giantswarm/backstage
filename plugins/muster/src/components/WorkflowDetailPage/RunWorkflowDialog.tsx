import { useState } from 'react';
import {
  Button,
  Checkbox,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  FormControlLabel,
  TextField,
  Typography,
  makeStyles,
  Theme,
} from '@material-ui/core';
import { Alert } from '@material-ui/lab';
import { useApi } from '@backstage/frontend-plugin-api';
import { JsonHighlight } from '@giantswarm/backstage-plugin-ui-react';
import { useMutation } from '@tanstack/react-query';
import { musterApiRef } from '../../apis';
import { WorkflowArgDefinition } from '../../lib/k8s';

const useStyles = makeStyles((theme: Theme) => ({
  field: {
    marginBottom: theme.spacing(2),
  },
  argType: {
    color: theme.palette.text.secondary,
  },
}));

type ArgEntry = [string, WorkflowArgDefinition];

/** Coerce a raw form value to the type the workflow argument declares. */
function coerce(
  def: WorkflowArgDefinition,
  raw: string | boolean,
): { value: unknown } | { error: string } {
  const type = (def.type ?? 'string').toLowerCase();
  if (type === 'boolean') {
    return { value: Boolean(raw) };
  }
  const text = String(raw).trim();
  if (text === '') {
    return { value: undefined };
  }
  if (type === 'number' || type === 'integer') {
    const num = Number(text);
    if (Number.isNaN(num)) {
      return { error: 'must be a number' };
    }
    return { value: num };
  }
  if (type === 'object' || type === 'array') {
    try {
      return { value: JSON.parse(text) };
    } catch {
      return { error: 'must be valid JSON' };
    }
  }
  return { value: text };
}

export interface RunWorkflowDialogProps {
  open: boolean;
  onClose: () => void;
  name: string;
  installation?: string;
  args: Record<string, WorkflowArgDefinition>;
  onRan?: () => void;
}

/**
 * Builds an argument form from the workflow's `spec.args` and runs the workflow
 * via the guarded muster proxy. The proxy rejects the run with 403 unless the
 * installation opts into mutations; this dialog should only be reachable when
 * the caller has confirmed mutations are allowed.
 *
 * ponytail: a minimal type-coerced form (string/number/boolean/JSON), not a
 * full JSON-schema form. Upgrade path: RJSF once nested object args appear.
 */
export function RunWorkflowDialog({
  open,
  onClose,
  name,
  installation,
  args,
  onRan,
}: RunWorkflowDialogProps) {
  const classes = useStyles();
  const musterApi = useApi(musterApiRef);
  const entries = Object.entries(args) as ArgEntry[];

  const [values, setValues] = useState<Record<string, string | boolean>>({});
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const mutation = useMutation({
    mutationFn: (built: Record<string, unknown>) =>
      musterApi.runWorkflow(name, built, installation),
    onSuccess: () => onRan?.(),
  });

  const setValue = (key: string, value: string | boolean) =>
    setValues(prev => ({ ...prev, [key]: value }));

  const handleRun = () => {
    const built: Record<string, unknown> = {};
    const errors: Record<string, string> = {};
    for (const [key, def] of entries) {
      const type = (def.type ?? 'string').toLowerCase();
      // Booleans always carry a value (the field default, if any); text-like
      // fields left blank are omitted so muster applies the workflow default.
      if (type === 'boolean') {
        built[key] = Boolean(values[key] ?? def.default ?? false);
        continue;
      }
      const raw = (values[key] as string | undefined) ?? '';
      const result = coerce(def, raw);
      if ('error' in result) {
        errors[key] = result.error;
        continue;
      }
      if (result.value === undefined) {
        if (def.required && def.default === undefined) {
          errors[key] = 'required';
        }
        continue;
      }
      built[key] = result.value;
    }
    setFieldErrors(errors);
    if (Object.keys(errors).length === 0) {
      mutation.mutate(built);
    }
  };

  const handleClose = () => {
    mutation.reset();
    setFieldErrors({});
    onClose();
  };

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
      <DialogTitle>Run workflow: {name}</DialogTitle>
      <DialogContent>
        {entries.length === 0 ? (
          <DialogContentText>
            This workflow takes no arguments.
          </DialogContentText>
        ) : (
          entries.map(([key, def]) => {
            const type = (def.type ?? 'string').toLowerCase();
            if (type === 'boolean') {
              return (
                <FormControlLabel
                  key={key}
                  className={classes.field}
                  control={
                    <Checkbox
                      checked={Boolean(values[key] ?? def.default ?? false)}
                      onChange={e => setValue(key, e.target.checked)}
                    />
                  }
                  label={
                    <>
                      {key}
                      {def.required ? ' *' : ''}{' '}
                      <span className={classes.argType}>({def.type})</span>
                    </>
                  }
                />
              );
            }
            const isJson = type === 'object' || type === 'array';
            return (
              <TextField
                key={key}
                className={classes.field}
                fullWidth
                multiline={isJson}
                minRows={isJson ? 3 : undefined}
                required={def.required}
                label={`${key} (${def.type})`}
                placeholder={
                  def.default !== undefined ? String(def.default) : undefined
                }
                helperText={
                  fieldErrors[key] ??
                  def.description ??
                  (def.default !== undefined
                    ? `Default: ${JSON.stringify(def.default)}`
                    : undefined)
                }
                error={Boolean(fieldErrors[key])}
                value={(values[key] as string | undefined) ?? ''}
                onChange={e => setValue(key, e.target.value)}
              />
            );
          })
        )}

        {mutation.isError && (
          <Alert severity="error" style={{ marginTop: 8 }}>
            {(mutation.error as Error).message}
          </Alert>
        )}
        {mutation.isSuccess && (
          <>
            <Typography variant="subtitle2" style={{ marginTop: 8 }}>
              Result
            </Typography>
            <JsonHighlight customStyle={{ margin: 0, fontSize: '0.75rem' }}>
              {JSON.stringify(mutation.data, null, 2)}
            </JsonHighlight>
          </>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={handleClose}>Close</Button>
        <Button
          color="primary"
          variant="contained"
          disabled={mutation.isPending}
          onClick={handleRun}
        >
          {mutation.isPending ? 'Running…' : 'Run'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
