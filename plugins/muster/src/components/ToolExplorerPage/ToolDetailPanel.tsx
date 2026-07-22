import { useEffect, useMemo, useState } from 'react';
import StarIcon from '@material-ui/icons/Star';
import StarBorderIcon from '@material-ui/icons/StarBorder';
import {
  Alert,
  Box,
  Button,
  ButtonIcon,
  Flex,
  Text,
  Tooltip,
  TooltipTrigger,
} from '@backstage/ui';
import { useApi } from '@backstage/frontend-plugin-api';
import { useMutation, useQuery } from '@tanstack/react-query';
import { musterApiRef } from '../../apis';
import {
  buildArgs,
  enumDefaults,
  fieldKind,
  FormValue,
  schemaFields,
} from '../../lib/schemaForm';
import { ToolArgField } from './ToolArgField';
import { ToolResultViewer } from './ToolResultViewer';
import { ExplorerError } from './ExplorerError';
import { DetailSkeleton } from './states';

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
  isFavourite: boolean;
  onToggleFavourite: () => void;
}

/**
 * Describes one tool (`describe_tool`), renders a JSON-schema-driven argument
 * form (typed widgets, inline validation, remembered last-used args), and
 * executes it via the `call_tool` proxy. The UI executes whatever tools muster
 * exposes; the trust boundary is the downstream MCP server's deployment (e.g.
 * mcp-kubernetes is deployed read-only), not the portal.
 */
export function ToolDetailPanel({
  name,
  installation,
  isFavourite,
  onToggleFavourite,
}: ToolDetailPanelProps) {
  const musterApi = useApi(musterApiRef);

  const storageKey = argsKey(installation, name);
  const [values, setValues] = useState<Record<string, FormValue>>(() =>
    loadStoredArgs(storageKey),
  );
  const [jsonModes, setJsonModes] = useState<Record<string, boolean>>({});
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
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

  // Once the schema resolves, pre-select enum defaults for fields the user (or
  // a remembered session) hasn't set yet, so the form shows the effective value
  // rather than a blank select.
  useEffect(() => {
    const defaults = enumDefaults(fields);
    if (Object.keys(defaults).length === 0) {
      return;
    }
    setValues(prev => {
      let changed = false;
      const next = { ...prev };
      for (const [key, value] of Object.entries(defaults)) {
        if (next[key] === undefined) {
          next[key] = value;
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [fields]);

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
    execute(args);
  };

  if (isLoading) {
    return <DetailSkeleton />;
  }
  if (error) {
    return <ExplorerError error={error} installation={installation} />;
  }

  return (
    <Box>
      <Flex align="center" justify="between" gap="2">
        <Text
          as="p"
          variant="title-small"
          weight="bold"
          style={{ fontFamily: 'monospace', minWidth: 0 }}
          truncate
        >
          {name}
        </Text>
        <TooltipTrigger>
          <ButtonIcon
            variant="tertiary"
            size="small"
            aria-label={isFavourite ? 'Remove favourite' : 'Add to favourites'}
            icon={
              isFavourite ? (
                <StarIcon fontSize="small" color="primary" />
              ) : (
                <StarBorderIcon fontSize="small" />
              )
            }
            onClick={onToggleFavourite}
          />
          <Tooltip>
            {isFavourite ? 'Remove favourite' : 'Add to favourites'}
          </Tooltip>
        </TooltipTrigger>
      </Flex>

      {data?.description && (
        <Box mt="1">
          <Text
            as="p"
            variant="body-medium"
            color="secondary"
            style={{ whiteSpace: 'pre-wrap' }}
          >
            {data.description}
          </Text>
        </Box>
      )}

      <Box mt="3">
        <Box mb="1">
          <Text as="p" variant="body-large" weight="bold">
            Arguments
          </Text>
        </Box>
        {fields.length === 0 ? (
          <Text variant="body-medium" color="secondary">
            This tool takes no arguments.
          </Text>
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

      <Box mt="2">
        <Button variant="primary" isPending={mutation.isPending} onClick={run}>
          {mutation.isPending ? 'Running…' : 'Execute'}
        </Button>
      </Box>

      {mutation.isError && (
        <Box mt="3">
          <Alert
            status="danger"
            title="Execution failed"
            description={(mutation.error as Error).message}
          />
        </Box>
      )}
      {mutation.isSuccess && (
        <Box mt="3">
          <Box mb="1">
            <Text as="p" variant="body-large" weight="bold">
              Result
            </Text>
          </Box>
          <ToolResultViewer
            result={mutation.data.result}
            durationMs={mutation.data.durationMs}
            onRerun={() => execute(lastArgs)}
            rerunDisabled={mutation.isPending}
          />
        </Box>
      )}
    </Box>
  );
}
