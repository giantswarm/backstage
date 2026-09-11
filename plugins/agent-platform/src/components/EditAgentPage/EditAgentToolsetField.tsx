import { useCallback, useMemo, useState } from 'react';
import {
  Alert,
  Button,
  FieldLabel,
  Flex,
  Tag,
  TagGroup,
  Text,
  TextField,
} from '@backstage/ui';
import { makeStyles } from '@material-ui/core';

import { useMusterServers } from '../../hooks/useMusterServers';
import { useToolsetPresets } from '../../hooks/useToolsetPresets';
import { useToolsetResolution } from '../../hooks/useToolsetResolution';
import {
  declaredToolset,
  presetSelector,
  selectorProblem,
  toggleSelector,
  toolsetProblems,
  toolsetShape,
} from '../../lib/toolset';
import { SelectableRow, SelectableRowList } from '../SelectableCard';
import { ToolsetResolutionList } from '../ToolsetResolutionList';

const useStyles = makeStyles(theme => ({
  manual: {
    display: 'flex',
    gap: theme.spacing(1),
    alignItems: 'flex-end',
  },
  manualField: {
    flex: 1,
  },
}));

export type EditAgentToolsetFieldProps = {
  installation: string;
  /** The selection: inline selectors without `preset:none` (empty = no tools). */
  value: string[];
  onChange: (selectors: string[]) => void;
};

/**
 * The agent's toolset as an editable selection: the presets the installation's
 * muster offers as checkable rows, every selector of the selection as a
 * removable tag, a field for a selector typed by hand (`server:x`, `tool:y`,
 * `workflow:z` — the grammar the chart and agent-manager enforce), and what the
 * selection resolves to for the person right now.
 *
 * The same model as the create flow's Tools step (`toggleSelector`,
 * `declaredToolset`: the empty selection is no tools and is sent as
 * `preset:none`), on the detail page's scale: the catalogue browser stays with
 * the create flow, the selector grammar is what every path shares.
 */
export function EditAgentToolsetField({
  installation,
  value,
  onChange,
}: EditAgentToolsetFieldProps) {
  const classes = useStyles();
  const presets = useToolsetPresets(installation);
  const { servers } = useMusterServers(installation);
  const declared = useMemo(() => declaredToolset(value), [value]);
  const resolution = useToolsetResolution(installation, declared);
  const shape = toolsetShape(declared);
  const problems = toolsetProblems(value);
  const selected = useMemo(() => new Set(value), [value]);

  const [manual, setManual] = useState('');
  const [manualProblem, setManualProblem] = useState<string | undefined>();
  const addManual = useCallback(() => {
    const selector = manual.trim();
    const problem = selectorProblem(selector);
    if (problem) {
      setManualProblem(problem);
      return;
    }
    setManualProblem(undefined);
    setManual('');
    if (!value.includes(selector)) {
      onChange(toggleSelector(value, selector));
    }
  }, [manual, value, onChange]);

  return (
    <Flex direction="column" gap="3">
      <FieldLabel
        label="Toolset"
        description="Which of the gateway's tools the agent can discover and call, within whatever the person using it may reach. Nothing selected means no tools."
      />

      <SelectableRowList role="group" ariaLabel="Presets">
        {presets.presets.map(preset => {
          const selector = presetSelector(preset.name);
          return (
            <SelectableRow
              key={selector}
              role="checkbox"
              selected={selected.has(selector)}
              ariaLabel={`Preset ${preset.name}`}
              onSelect={() => onChange(toggleSelector(value, selector))}
              title={selector}
              code
              summary={preset.description}
            />
          );
        })}
      </SelectableRowList>
      {presets.source === 'built-in' && (
        <Text variant="body-x-small" color="secondary">
          Only the built-in presets are known
          {presets.error ? ` (${presets.error})` : ''}.
        </Text>
      )}

      <div className={classes.manual}>
        <div className={classes.manualField}>
          <TextField
            label="Add a selector"
            size="small"
            placeholder="server:mcp-prometheus, workflow:…, tool:…"
            value={manual}
            onChange={setManual}
            onKeyDown={event => {
              if (event.key === 'Enter') {
                event.preventDefault();
                addManual();
              }
            }}
          />
        </div>
        <Button variant="secondary" size="small" onPress={addManual}>
          Add
        </Button>
      </div>
      {manualProblem && (
        <Alert
          status="danger"
          title="Not a selector"
          description={manualProblem}
        />
      )}

      <Flex direction="column" gap="1">
        <Text variant="body-small" weight="bold">
          Declared as
        </Text>
        {value.length === 0 ? (
          <Text variant="body-small" color="secondary">
            <span style={{ fontFamily: 'monospace' }}>preset:none</span> — a
            chat-only agent without tools.
          </Text>
        ) : (
          <TagGroup
            aria-label="Selected selectors"
            onRemove={keys => {
              const removed = new Set(Array.from(keys as Set<string>));
              onChange(value.filter(selector => !removed.has(selector)));
            }}
          >
            {value.map(selector => (
              <Tag key={selector} id={selector}>
                {selector}
              </Tag>
            ))}
          </TagGroup>
        )}
      </Flex>

      {problems.length > 0 && (
        <Alert
          status="danger"
          title="This toolset cannot be applied"
          description={problems.join(' ')}
        />
      )}
      {shape === 'full' && (
        <Alert
          status="warning"
          title="Full gateway access"
          description="This agent can discover and call every tool the gateway exposes to whoever invokes it — platform administration included."
        />
      )}

      <Flex direction="column" gap="1">
        <Text variant="body-small" weight="bold">
          Resolves for you to
        </Text>
        <ToolsetResolutionList resolution={resolution} servers={servers} />
      </Flex>
    </Flex>
  );
}
