import { ReactNode, useEffect, useId, useMemo, useState } from 'react';
import { useTrackedMutation } from '@giantswarm/backstage-plugin-analytics-react';
import { Alert, Box, Button, Flex, Text } from '@backstage/ui';
import { useApi } from '@backstage/frontend-plugin-api';
import {
  SectionHeader,
  TechnicalDetailsFoldOut,
  YamlEditorFormField,
  isAwaitingData,
} from '@giantswarm/backstage-plugin-ui-react';
import { musterApiRef } from '../../apis';
import { useToolDescription } from '../shared';
import {
  buildArgs,
  enumDefaults,
  fieldKind,
  FormValue,
  schemaFields,
} from '../../lib/schemaForm';
import { ToolArgField } from './ToolArgField';
import { RESULT_MAX_HEIGHT, ToolResultViewer } from './ToolResultViewer';
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

/** A section of the tool's page: an `h2` that names its region, then the content. */
function Section({ title, children }: { title: string; children: ReactNode }) {
  const headingId = useId();
  return (
    <section aria-labelledby={headingId}>
      <SectionHeader
        as="h2"
        variant="title-x-small"
        title={title}
        id={headingId}
      />
      <Box mt="2">{children}</Box>
    </section>
  );
}

/** A call's outcome as the Result section shows it. */
type CallResult = { result: unknown; durationMs: number };

export interface ToolDetailPanelProps {
  name: string;
  installation?: string;
  /** One line beside the run button, e.g. what running the tool does. */
  note?: string;
}

/**
 * The body of a tool's page, in sections down its single column: the
 * tool's description, its input schema folded away, "Try it" (the argument
 * form and the run button) and the result. The page's header carries the
 * name and the markers.
 *
 * Describes one tool (`describe_tool`), renders a JSON-schema-driven argument
 * form (typed widgets, inline validation, remembered last-used args), and
 * executes it via the `call_tool` proxy. The UI executes whatever tools muster
 * exposes; the trust boundary is the downstream MCP server's deployment (e.g.
 * mcp-kubernetes is deployed read-only), not the portal.
 */
export function ToolDetailPanel({
  name,
  installation,
  note,
}: ToolDetailPanelProps) {
  const musterApi = useApi(musterApiRef);
  // The last call that returned, kept on screen while a re-run is pending:
  // the result is most of the page, and dropping it would collapse the page
  // under the reader until the call returns.
  const [lastResult, setLastResult] = useState<CallResult | undefined>();

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

  const description = useToolDescription(name, installation);
  const { data, error } = description;
  const isLoading = isAwaitingData(description);

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

  const mutation = useTrackedMutation({
    event: null,
    untrackedReason:
      'A tool call from the explorer; its arguments are free text and stay out.',
    mutationFn: async (args: Record<string, unknown>) => {
      const startedAt = performance.now();
      const result = await musterApi.callTool(name, args, installation);
      return { result, durationMs: Math.round(performance.now() - startedAt) };
    },
    onSuccess: setLastResult,
    // A failed call says so above; an older result below would read as its.
    onError: () => setLastResult(undefined),
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

  const executeButton = (
    <Button variant="primary" isPending={mutation.isPending} onClick={run}>
      {mutation.isPending ? 'Running…' : 'Run'}
    </Button>
  );

  if (isLoading) {
    return <DetailSkeleton />;
  }
  if (error) {
    return <ExplorerError error={error} installation={installation} />;
  }

  return (
    <Flex direction="column" gap="5">
      {/* Headed as the agent, skill and workflow pages head theirs. */}
      <Section title="What it’s for">
        {data?.description ? (
          <Text
            as="p"
            variant="body-medium"
            style={{
              margin: 0,
              whiteSpace: 'pre-wrap',
              overflowWrap: 'anywhere',
            }}
          >
            {data.description}
          </Text>
        ) : (
          <Text as="p" variant="body-medium" color="secondary">
            Its connector gives no description.
          </Text>
        )}
      </Section>

      {data?.inputSchema && (
        // Technical detail, folded in place and boxed as the other pages'
        // Technical details: the form below is the schema drawn for people.
        // Opened, it is as tall as a result may be.
        <TechnicalDetailsFoldOut title="Input schema" defaultExpanded={false}>
          <YamlEditorFormField
            value={JSON.stringify(data.inputSchema, null, 2)}
            language="json"
            readOnly
            maxHeight={RESULT_MAX_HEIGHT}
          />
        </TechnicalDetailsFoldOut>
      )}

      <Section title="Try it">
        {fields.length === 0 ? (
          <Text as="p" variant="body-medium" color="secondary">
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
        <Box mt="2">
          {note ? (
            <Flex align="center" gap="3" style={{ flexWrap: 'wrap' }}>
              {executeButton}
              <Text variant="body-small" color="secondary">
                {note}
              </Text>
            </Flex>
          ) : (
            executeButton
          )}
        </Box>
        {mutation.isError && (
          <Box mt="3">
            <Alert
              status="danger"
              title="Could not run the tool"
              description={(mutation.error as Error).message}
            />
          </Box>
        )}
      </Section>

      {lastResult && (
        <Section title="Result">
          <ToolResultViewer
            result={lastResult.result}
            durationMs={lastResult.durationMs}
            onRerun={() => execute(lastArgs)}
            rerunDisabled={mutation.isPending}
          />
        </Section>
      )}
    </Flex>
  );
}
