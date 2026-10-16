import { ReactNode, useEffect, useId, useMemo, useRef, useState } from 'react';
import { Alert, Box, Button, Flex, Text } from '@backstage/ui';
import {
  SectionHeader,
  TechnicalDetailsFoldOut,
  YamlEditorFormField,
  isAwaitingData,
  useFieldValidation,
} from '@giantswarm/backstage-plugin-ui-react';
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
import { ToolRun, useToolRun } from './useToolRun';

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

export interface ToolDetailPanelProps {
  name: string;
  installation?: string;
  /** One line beside the run button, e.g. what running the tool does. */
  note?: string;
  /**
   * What the tool is: a connector's or muster's own tool, or the tool muster
   * runs a workflow as (`workflow_<name>`). A workflow's page says what it is
   * for on Overview, so its run form leaves the description out and speaks
   * of inputs and the workflow.
   */
  subject?: 'tool' | 'workflow';
  /**
   * The runs of the tool, where a page keeps them above the panel (a
   * workflow page, across its tabs); else the panel keeps its own.
   */
  run?: ToolRun;
}

/**
 * The body of a tool's page, in sections down its single column: the
 * tool's description, its input schema folded away, "Try it" (the argument
 * form and the run button) and the result. The page's header carries the
 * name and the markers. A workflow's Run it tab renders the same body for
 * the workflow's tool, without the description and with "Inputs" for "Try
 * it".
 *
 * Describes one tool (`describe_tool`), renders a JSON-schema-driven argument
 * form (typed widgets, inline validation, remembered last-used args), and
 * runs it with {@link useToolRun}.
 */
export function ToolDetailPanel({
  name,
  installation,
  note,
  subject = 'tool',
  run,
}: ToolDetailPanelProps) {
  // Always called, as hooks must be; idle where the page passes its own.
  const ownRun = useToolRun(name, installation);
  const toolRun = run ?? ownRun;

  const storageKey = argsKey(installation, name);
  const [values, setValues] = useState<Record<string, FormValue>>(() =>
    loadStoredArgs(storageKey),
  );
  const [jsonModes, setJsonModes] = useState<Record<string, boolean>>({});
  // Each argument shows its problem once the person leaves it having typed
  // in it, or presses Run; a blocked Run focuses the first (the `forms`
  // skill). Scoped to the form: a workflow's tab has its own fields around.
  const formScope = useRef<HTMLDivElement>(null);
  const validation = useFieldValidation(formScope);
  const { reset: resetValidation } = validation;

  // Reload the remembered args when the selected tool changes.
  useEffect(() => {
    setValues(loadStoredArgs(storageKey));
    setJsonModes({});
    resetValidation();
  }, [storageKey, resetValidation]);

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
    storeArgs(storageKey, values);
    toolRun.run(args);
  };

  const {
    args,
    errors: fieldErrors,
    errorItems,
  } = useMemo(() => buildArgs(fields, values), [fields, values]);
  const submit = () => {
    if (Object.keys(fieldErrors).length > 0) {
      validation.reveal();
      return;
    }
    execute(args);
  };

  const executeButton = (
    <Button variant="primary" isPending={toolRun.isPending} onClick={submit}>
      {toolRun.isPending ? 'Running…' : 'Run'}
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
      {subject === 'tool' && (
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
      )}

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

      <Section title={subject === 'workflow' ? 'Inputs' : 'Try it'}>
        {fields.length === 0 ? (
          <Text as="p" variant="body-medium" color="secondary">
            {subject === 'workflow'
              ? 'This workflow takes no inputs.'
              : 'This tool takes no arguments.'}
          </Text>
        ) : (
          <div ref={formScope}>
            {fields.map(field => (
              <ToolArgField
                key={field.name}
                field={field}
                value={values[field.name]}
                error={validation.errorFor(field.name, fieldErrors[field.name])}
                invalidItem={errorItems[field.name]}
                blurProps={validation.blurProps(
                  field.name,
                  fieldErrors[field.name],
                  values[field.name],
                )}
                jsonMode={
                  Boolean(jsonModes[field.name]) && fieldKind(field) === 'array'
                }
                onChange={value => setValue(field.name, value)}
                onToggleJson={() => toggleJson(field)}
              />
            ))}
          </div>
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
        {toolRun.error && (
          <Box mt="3">
            <Alert
              status="danger"
              title={`Could not run the ${subject}`}
              description={toolRun.error.message}
            />
          </Box>
        )}
      </Section>

      {toolRun.lastResult && (
        <Section title="Result">
          <ToolResultViewer
            result={toolRun.lastResult.result}
            durationMs={toolRun.lastResult.durationMs}
            onRerun={toolRun.rerun}
            rerunDisabled={toolRun.isPending}
          />
        </Section>
      )}
    </Flex>
  );
}
