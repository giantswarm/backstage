import type { ReactNode } from 'react';
import { Alert, Flex, Text } from '@backstage/ui';
import { makeStyles } from '@material-ui/core';
import { ServerSignIn } from '@giantswarm/backstage-plugin-muster';

import { useUnderlyingModel } from '../../hooks/useUnderlyingModel';
import {
  AGENT_MANAGER_SERVER,
  type AgentPluginEntry,
} from '../../lib/agentManager';
import { pluginEntryKey, pluginLabel, pluginPin } from '../../lib/plugins';
import { shortPin } from '../AgentDetailPage/helpers';
import { countNoun, parseSelector } from '../../lib/toolset';
import { presetPhrase } from '../../lib/toolsetReach';

// The pieces the create and the edit review share: the plain summary rows,
// the technical fold-out's styles and items, and agent-manager's verdicts.

export const useReviewStyles = makeStyles(theme => ({
  // The plain summary: one row per answer, the label in a fixed column that
  // stacks above the value on a phone.
  plain: {
    margin: 0,
    borderTop: '1px solid var(--bui-border-1)',
  },
  plainRow: {
    display: 'flex',
    flexWrap: 'wrap',
    columnGap: theme.spacing(2),
    rowGap: theme.spacing(0.5),
    padding: theme.spacing(1.75, 0),
    borderBottom: '1px solid var(--bui-border-1)',
    '& dt': {
      flex: '0 0 140px',
      color: 'var(--bui-fg-secondary)',
    },
    '& dd': {
      margin: 0,
      flex: '1 1 240px',
      minWidth: 0,
      overflowWrap: 'anywhere',
    },
  },
  summary: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: theme.spacing(4),
    padding: theme.spacing(2, 0),
    borderBottom: `1px solid ${theme.palette.divider}`,
    marginBottom: theme.spacing(3),
  },
  code: {
    fontFamily: 'monospace',
    overflowWrap: 'anywhere',
  },
  section: {
    marginBottom: theme.spacing(3),
  },
  sectionTitle: {
    marginBottom: theme.spacing(0.5),
  },
  sectionDescription: {
    maxWidth: '70ch',
    marginBottom: theme.spacing(2),
  },
  files: {
    display: 'flex',
    flexDirection: 'column',
    gap: theme.spacing(2),
  },
  violations: {
    margin: 0,
    paddingLeft: theme.spacing(2.5),
  },
  technical: {
    border: '1px solid var(--bui-border-1)',
    borderRadius: 12,
    padding: theme.spacing(1.5, 2),
  },
  details: {
    border: `1px solid ${theme.palette.divider}`,
    borderRadius: theme.shape.borderRadius,
    padding: theme.spacing(1.5),
    marginTop: theme.spacing(2),
  },
  summaryLine: {
    cursor: 'pointer',
    fontWeight: 600,
  },
  technicalSummary: {
    cursor: 'pointer',
    color: 'var(--bui-fg-primary)',
  },
  detailsBody: {
    marginTop: theme.spacing(1.5),
    display: 'flex',
    flexDirection: 'column',
    gap: theme.spacing(1.5),
  },
}));

// lineWidth: -1 keeps prompts and URLs unfolded; noRefs avoids YAML anchors.
export const YAML_OPTS = { lineWidth: -1, noRefs: true } as const;

/**
 * The one-line Tools summary in words (QA R2-2): the loud labels, else each
 * preset and whole connector by name, and the rest counted, the way the Tools
 * step's grid names them (`labelOf` gives a connector's display name). The
 * selectors as written are in Technical details.
 */
export function toolsetSummaryLabel(
  shape: 'none' | 'full' | 'composed',
  declared: string[],
  labelOf: (connector: string) => string = connector => connector,
): string {
  if (shape === 'none') {
    return 'No tools';
  }
  if (shape === 'full') {
    return 'Full gateway access';
  }
  const parts: string[] = [];
  const counts = { tool: 0, workflow: 0, other: 0 };
  for (const selector of declared) {
    const parsed = parseSelector(selector);
    if (parsed?.kind === 'preset') {
      // Preset phrases are shared with the composer's reach line.
      parts.push(presetPhrase(parsed.name));
    } else if (parsed?.kind === 'server') {
      parts.push(`all ${labelOf(parsed.name)} tools`);
    } else if (parsed?.kind === 'tool' || parsed?.kind === 'workflow') {
      counts[parsed.kind] += 1;
    } else {
      counts.other += 1;
    }
  }
  if (counts.tool > 0) {
    parts.push(countNoun(counts.tool, 'individual tool'));
  }
  if (counts.workflow > 0) {
    parts.push(countNoun(counts.workflow, 'workflow'));
  }
  if (counts.other > 0) {
    parts.push(countNoun(counts.other, 'other selector'));
  }
  const text = parts.filter(Boolean).join('; ');
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : 'No tools';
}

export function SummaryItem({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <Flex direction="column" gap="1">
      <Text variant="body-x-small" color="secondary">
        {label}
      </Text>
      {children}
    </Flex>
  );
}

/**
 * The model the picked ModelConfig runs, beside the ModelConfig's own name in
 * the technical fold-out (PO decision L6: the name stays, the model is one
 * disclosure away). Renders nothing while the ModelConfig cannot be read.
 */
export function UnderlyingModelItem({
  installation,
  modelConfigName,
  namespace,
}: {
  installation: string | undefined;
  modelConfigName: string | undefined;
  namespace: string | undefined;
}) {
  const classes = useReviewStyles();
  const model = useUnderlyingModel(installation, modelConfigName, namespace);
  if (!model) {
    return null;
  }
  return (
    <SummaryItem label="Underlying model">
      <span className={classes.code}>{model}</span>
    </SummaryItem>
  );
}

/** Each plugin at the commit (or digest) it is pinned to: what is written. */
export function PluginPins({ entries }: { entries: AgentPluginEntry[] }) {
  const classes = useReviewStyles();
  return (
    <SummaryItem label="Plugin pins">
      <Text variant="body-small">
        {entries.map((entry, index) => (
          <span key={pluginEntryKey(entry)}>
            {index > 0 ? ', ' : ''}
            {pluginLabel(entry)}{' '}
            <span className={classes.code}>@{shortPin(pluginPin(entry))}</span>
          </span>
        ))}
      </Text>
    </SummaryItem>
  );
}

/** One row of the plain summary: what the person answered, in their words. */
export function PlainRow({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  const classes = useReviewStyles();
  return (
    <div className={classes.plainRow}>
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

export function SectionTitle({
  title,
  description,
}: {
  title: string;
  description: ReactNode;
}) {
  const classes = useReviewStyles();
  return (
    <>
      <Text
        as="h3"
        variant="title-x-small"
        weight="bold"
        className={classes.sectionTitle}
      >
        {title}
      </Text>
      <Text as="p" color="secondary" className={classes.sectionDescription}>
        {description}
      </Text>
    </>
  );
}

/**
 * agent-manager's refusal for the whole configuration: every schema violation
 * and precondition failure of the dry run, verbatim.
 */
export function Violations({ errors }: { errors: string[] }) {
  const classes = useReviewStyles();
  return (
    <Alert
      status="danger"
      title="agent-manager refuses this configuration"
      description={
        <ul className={classes.violations} aria-label="Violations">
          {errors.map(error => (
            <li key={error}>{error}</li>
          ))}
        </ul>
      }
    />
  );
}

/**
 * The checks agent-manager's dry run could not make. Informational: the dry
 * run is still valid, so they never block Deploy.
 */
export function Notes({ notes }: { notes: string[] }) {
  const classes = useReviewStyles();
  return (
    <Alert
      status="info"
      title="agent-manager could not check everything"
      description={
        <ul className={classes.violations} aria-label="Notes">
          {notes.map(note => (
            <li key={note}>{note}</li>
          ))}
        </ul>
      }
    />
  );
}

/** The person's muster session is not connected to agent-manager yet. */
export function ConnectAgentManager({
  installation,
  message,
}: {
  installation: string;
  message: string;
}) {
  return (
    <Alert
      status="warning"
      title="Connect to agent-manager"
      description={
        <Flex direction="column" gap="2">
          <Text variant="body-small">
            Agents are created through agent-manager, reached through muster as
            you. Your muster session on {installation} is not connected to it
            yet: {message}
          </Text>
          <ServerSignIn
            noun="connector"
            serverName={AGENT_MANAGER_SERVER}
            installation={installation}
          />
        </Flex>
      }
    />
  );
}
