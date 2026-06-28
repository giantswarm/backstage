import { useEffect, useMemo, useState } from 'react';
import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  IconButton,
  Tooltip,
  Typography,
  makeStyles,
  Theme,
} from '@material-ui/core';
import StarIcon from '@material-ui/icons/Star';
import StarBorderIcon from '@material-ui/icons/StarBorder';
import { Alert } from '@material-ui/lab';
import { useApi } from '@backstage/frontend-plugin-api';
import { useMutation, useQuery } from '@tanstack/react-query';
import { musterApiRef } from '../../apis';
import {
  buildArgs,
  fieldKind,
  FormValue,
  schemaFields,
} from '../../lib/schemaForm';
import { classifyTool, ToolRisk } from '../../lib/mutationGuard';
import { StateBadge } from '../shared';
import { ToolArgField } from './ToolArgField';
import { ToolResultViewer } from './ToolResultViewer';
import { ExplorerError } from './ExplorerError';
import { DetailSkeleton } from './states';

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
  spacer: {
    marginLeft: 'auto',
  },
  description: {
    marginTop: theme.spacing(1),
    whiteSpace: 'pre-wrap',
  },
  section: {
    marginTop: theme.spacing(2),
  },
  actions: {
    display: 'flex',
    alignItems: 'center',
    gap: theme.spacing(2),
    marginTop: theme.spacing(1),
  },
}));

function riskBadge(risk: ToolRisk) {
  switch (risk) {
    case 'blocked':
      return <StateBadge tone="error" label="Blocked · GitOps" />;
    case 'mutating':
      return <StateBadge tone="warning" label="Mutating" />;
    default:
      return <StateBadge tone="ok" label="Read-only" />;
  }
}

/** localStorage key for a tool's last-used arguments, scoped per installation. */
function argsKey(installation: string | undefined, name: string): string {
  return `muster-tool-args:${installation ?? 'default'}/${name}`;
}

function loadStoredArgs(key: string): Record<string, FormValue> {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as Record<string, FormValue>) : {};
  } catch {
    return {};
  }
}

function storeArgs(key: string, values: Record<string, FormValue>) {
  try {
    window.localStorage.setItem(key, JSON.stringify(values));
  } catch {
    // localStorage may be unavailable (private mode); not fatal.
  }
}

export interface ToolDetailPanelProps {
  name: string;
  installation?: string;
  /** Whether the target installation permits mutating calls. */
  allowMutations: boolean;
  isFavourite: boolean;
  onToggleFavourite: () => void;
}

/**
 * Describes one tool (`describe_tool`), renders a JSON-schema-driven argument
 * form (typed widgets, inline validation, remembered last-used args), and
 * executes it via the guarded `call_tool` proxy. Mutating tools are gated:
 * apply/patch are hard-blocked, other mutating verbs need an explicit confirm
 * and an installation that opts into mutations.
 */
export function ToolDetailPanel({
  name,
  installation,
  allowMutations,
  isFavourite,
  onToggleFavourite,
}: ToolDetailPanelProps) {
  const classes = useStyles();
  const musterApi = useApi(musterApiRef);

  const storageKey = argsKey(installation, name);
  const [values, setValues] = useState<Record<string, FormValue>>(() =>
    loadStoredArgs(storageKey),
  );
  const [jsonModes, setJsonModes] = useState<Record<string, boolean>>({});
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [lastArgs, setLastArgs] = useState<Record<string, unknown>>({});

  // Reload the remembered args when the selected tool changes.
  useEffect(() => {
    setValues(loadStoredArgs(storageKey));
    setJsonModes({});
    setFieldErrors({});
  }, [storageKey]);

  const { data, isLoading, error } = useQuery({
    queryKey: ['muster', 'describe-tool', installation, name],
    queryFn: () => musterApi.describeTool(name, installation),
  });

  const fields = useMemo(() => schemaFields(data?.inputSchema), [data]);
  const risk = classifyTool(name);

  const mutation = useMutation({
    mutationFn: async (args: Record<string, unknown>) => {
      const startedAt = performance.now();
      const result = await musterApi.callTool(name, args, installation);
      return { result, durationMs: Math.round(performance.now() - startedAt) };
    },
  });

  const setValue = (key: string, value: FormValue) =>
    setValues(prev => ({ ...prev, [key]: value }));

  const toggleJson = (field: (typeof fields)[number]) => {
    setJsonModes(prev => {
      const nextOn = !prev[field.name];
      // Convert the value between rows and a JSON string so neither is lost.
      setValues(current => {
        const v = current[field.name];
        if (nextOn) {
          const arr = Array.isArray(v) ? v : [];
          return { ...current, [field.name]: JSON.stringify(arr) };
        }
        let rows: string[] = [];
        if (typeof v === 'string' && v.trim() !== '') {
          try {
            const parsed = JSON.parse(v);
            if (Array.isArray(parsed)) {
              rows = parsed.map(item =>
                typeof item === 'object' ? JSON.stringify(item) : String(item),
              );
            }
          } catch {
            rows = [];
          }
        }
        return { ...current, [field.name]: rows };
      });
      return { ...prev, [field.name]: nextOn };
    });
  };

  const execute = (args: Record<string, unknown>) => {
    setLastArgs(args);
    storeArgs(storageKey, values);
    mutation.mutate(args);
  };

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
    execute(args);
  };

  const confirmRun = () => {
    setConfirmOpen(false);
    const { args } = buildArgs(fields, values);
    execute(args);
  };

  if (isLoading) {
    return <DetailSkeleton />;
  }
  if (error) {
    return <ExplorerError error={error} installation={installation} />;
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
        {riskBadge(risk)}
        <Box className={classes.spacer} />
        <Tooltip title={isFavourite ? 'Remove favourite' : 'Add to favourites'}>
          <IconButton size="small" onClick={onToggleFavourite}>
            {isFavourite ? (
              <StarIcon fontSize="small" color="primary" />
            ) : (
              <StarBorderIcon fontSize="small" />
            )}
          </IconButton>
        </Tooltip>
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
            <ToolArgField
              key={field.name}
              field={field}
              value={values[field.name]}
              error={fieldErrors[field.name]}
              jsonMode={
                Boolean(jsonModes[field.name]) && fieldKind(field) === 'array'
              }
              onChange={value => setValue(field.name, value)}
              onToggleJson={() => toggleJson(field)}
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
          <ToolResultViewer
            result={mutation.data.result}
            durationMs={mutation.data.durationMs}
            onRerun={() => execute(lastArgs)}
            rerunDisabled={mutation.isPending}
          />
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
