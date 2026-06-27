import { useMemo, useState } from 'react';
import {
  Box,
  Button,
  Checkbox,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  FormControlLabel,
  MenuItem,
  TextField,
  Typography,
  makeStyles,
  Theme,
} from '@material-ui/core';
import { Alert } from '@material-ui/lab';
import { Progress, ResponseErrorPanel } from '@backstage/core-components';
import { useApi } from '@backstage/frontend-plugin-api';
import { useMutation, useQuery } from '@tanstack/react-query';
import { musterApiRef } from '../../apis';
import {
  buildArgs,
  fieldKind,
  schemaFields,
  SchemaField,
} from '../../lib/schemaForm';
import { classifyTool } from '../../lib/mutationGuard';
import { ToolResultViewer } from './ToolResultViewer';

const useStyles = makeStyles((theme: Theme) => ({
  header: {
    display: 'flex',
    alignItems: 'center',
    gap: theme.spacing(1),
    flexWrap: 'wrap',
  },
  toolName: {
    fontFamily: 'monospace',
    fontWeight: 600,
  },
  description: {
    marginTop: theme.spacing(1),
    whiteSpace: 'pre-wrap',
  },
  section: {
    marginTop: theme.spacing(2),
  },
  field: {
    marginBottom: theme.spacing(2),
  },
  argType: {
    color: theme.palette.text.secondary,
  },
  actions: {
    display: 'flex',
    alignItems: 'center',
    gap: theme.spacing(2),
    marginTop: theme.spacing(1),
  },
}));

function riskChip(risk: ReturnType<typeof classifyTool>) {
  switch (risk) {
    case 'blocked':
      return (
        <Chip size="small" color="secondary" label="apply/patch — blocked" />
      );
    case 'mutating':
      return <Chip size="small" color="primary" label="mutating" />;
    default:
      return <Chip size="small" label="read-only" />;
  }
}

function FieldInput({
  field,
  value,
  error,
  onChange,
}: {
  field: SchemaField;
  value: string | boolean | undefined;
  error?: string;
  onChange: (value: string | boolean) => void;
}) {
  const classes = useStyles();
  const kind = fieldKind(field);

  if (kind === 'boolean') {
    return (
      <FormControlLabel
        className={classes.field}
        control={
          <Checkbox
            checked={Boolean(value ?? field.default ?? false)}
            onChange={e => onChange(e.target.checked)}
          />
        }
        label={
          <>
            {field.name}
            {field.required ? ' *' : ''}{' '}
            <span className={classes.argType}>(boolean)</span>
          </>
        }
      />
    );
  }

  const helperText =
    error ??
    field.description ??
    (field.default !== undefined
      ? `Default: ${JSON.stringify(field.default)}`
      : undefined);
  const isJson = kind === 'json';

  if (kind === 'enum') {
    return (
      <TextField
        select
        className={classes.field}
        fullWidth
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

  return (
    <TextField
      className={classes.field}
      fullWidth
      multiline={isJson}
      minRows={isJson ? 3 : undefined}
      required={field.required}
      label={`${field.name} (${field.type})`}
      helperText={helperText}
      error={Boolean(error)}
      value={(value as string | undefined) ?? ''}
      onChange={e => onChange(e.target.value)}
    />
  );
}

export interface ToolDetailPanelProps {
  name: string;
  installation?: string;
  /** Whether the target installation permits mutating calls. */
  allowMutations: boolean;
}

/**
 * Describes one tool (`describe_tool`), renders a JSON-schema-driven argument
 * form, and executes it via the guarded `call_tool` proxy. Mutating tools are
 * gated: apply/patch are hard-blocked, other mutating verbs need an explicit
 * confirm and an installation that opts into mutations.
 */
export function ToolDetailPanel({
  name,
  installation,
  allowMutations,
}: ToolDetailPanelProps) {
  const classes = useStyles();
  const musterApi = useApi(musterApiRef);

  const [values, setValues] = useState<Record<string, string | boolean>>({});
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [confirmOpen, setConfirmOpen] = useState(false);

  const { data, isLoading, error } = useQuery({
    queryKey: ['muster', 'describe-tool', installation, name],
    queryFn: () => musterApi.describeTool(name, installation),
  });

  const fields = useMemo(() => schemaFields(data?.inputSchema), [data]);
  const risk = classifyTool(name);

  const mutation = useMutation({
    mutationFn: (args: Record<string, unknown>) =>
      musterApi.callTool(name, args, installation),
  });

  const setValue = (key: string, value: string | boolean) =>
    setValues(prev => ({ ...prev, [key]: value }));

  const run = () => {
    const { args, errors } = buildArgs(fields, values);
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) {
      return;
    }
    if (risk === 'mutating') {
      setConfirmOpen(true);
      return;
    }
    mutation.mutate(args);
  };

  const confirmRun = () => {
    setConfirmOpen(false);
    const { args } = buildArgs(fields, values);
    mutation.mutate(args);
  };

  if (isLoading) {
    return <Progress />;
  }
  if (error) {
    return <ResponseErrorPanel error={error as Error} />;
  }

  const blocked = risk === 'blocked';
  const readOnlyInstallation = risk === 'mutating' && !allowMutations;
  const executeDisabled = blocked || readOnlyInstallation || mutation.isPending;

  return (
    <Box>
      <Box className={classes.header}>
        <Typography variant="h6" className={classes.toolName}>
          {name}
        </Typography>
        {riskChip(risk)}
      </Box>
      {data?.description && (
        <Typography
          variant="body2"
          color="textSecondary"
          className={classes.description}
        >
          {data.description}
        </Typography>
      )}

      <Box className={classes.section}>
        <Typography variant="subtitle2" gutterBottom>
          Arguments
        </Typography>
        {fields.length === 0 ? (
          <Typography variant="body2" color="textSecondary">
            This tool takes no arguments.
          </Typography>
        ) : (
          fields.map(field => (
            <FieldInput
              key={field.name}
              field={field}
              value={values[field.name]}
              error={fieldErrors[field.name]}
              onChange={value => setValue(field.name, value)}
            />
          ))
        )}
      </Box>

      {blocked && (
        <Alert severity="warning" className={classes.section}>
          This tool applies or patches cluster state. Clusters are managed via
          GitOps, so it cannot be run from the portal.
        </Alert>
      )}
      {readOnlyInstallation && (
        <Alert severity="info" className={classes.section}>
          This installation is read-only. Enable <code>allowMutations</code> for
          it in the muster proxy config to run mutating tools.
        </Alert>
      )}

      <Box className={classes.actions}>
        <Button
          color="primary"
          variant="contained"
          disabled={executeDisabled}
          onClick={run}
        >
          {mutation.isPending ? 'Running…' : 'Execute'}
        </Button>
        {risk === 'mutating' && allowMutations && (
          <Typography variant="caption" color="textSecondary">
            Mutating tool — you'll be asked to confirm.
          </Typography>
        )}
      </Box>

      {mutation.isError && (
        <Alert severity="error" className={classes.section}>
          {(mutation.error as Error).message}
        </Alert>
      )}
      {mutation.isSuccess && (
        <Box className={classes.section}>
          <Typography variant="subtitle2" gutterBottom>
            Result
          </Typography>
          <ToolResultViewer result={mutation.data} />
        </Box>
      )}

      <Dialog open={confirmOpen} onClose={() => setConfirmOpen(false)}>
        <DialogTitle>Run mutating tool?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            <code>{name}</code> looks like it mutates state. Confirm you want to
            execute it against{' '}
            <strong>{installation ?? 'the muster installation'}</strong>.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmOpen(false)}>Cancel</Button>
          <Button color="primary" variant="contained" onClick={confirmRun}>
            Run
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
