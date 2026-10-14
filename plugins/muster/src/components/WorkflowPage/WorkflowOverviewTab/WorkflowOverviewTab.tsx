import { ReactNode } from 'react';
import { Alert, Text } from '@backstage/ui';
import { makeStyles, Theme } from '@material-ui/core';
import {
  DateComponent,
  SectionHeader,
} from '@giantswarm/backstage-plugin-ui-react';
import { MusterWorkflow } from '../../../lib/k8s';
import { ServerPrefixInfo } from '../../../lib/toolGrouping';
import { WorkflowFlowCanvas } from '../WorkflowFlowCanvas';

const useStyles = makeStyles((theme: Theme) => ({
  sections: {
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--bui-space-6)',
  },
  section: {
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--bui-space-3)',
    // SectionHeader carries margins meant for a page's flow; these sections
    // space their parts by the gap alone, as the agent and skill pages do.
    '& > div:first-child > h2': { marginBottom: 0 },
    '& > div:first-child > p': {
      marginTop: 'var(--bui-space-1)',
      marginBottom: 0,
    },
  },
  description: {
    margin: 0,
    overflowWrap: 'anywhere',
  },
  argList: {
    border: '1px solid var(--bui-border-1)',
    borderRadius: theme.shape.borderRadius * 2,
    overflow: 'hidden',
  },
  argRow: {
    display: 'flex',
    flexDirection: 'column',
    gap: theme.spacing(0.5),
    padding: theme.spacing(1.25, 1.5),
    borderTop: '1px solid var(--bui-border-1)',
    '&:first-child': { borderTop: 'none' },
    [theme.breakpoints.up('sm')]: {
      flexDirection: 'row',
      alignItems: 'baseline',
      gap: theme.spacing(1.5),
    },
  },
  argHead: {
    flexShrink: 0,
    // Never wider than the row: a long default wraps inside its pill.
    minWidth: 0,
    maxWidth: '100%',
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: theme.spacing(1),
  },
  mono: {
    fontFamily: 'monospace',
    fontSize: 13,
    wordBreak: 'break-all',
  },
  pill: {
    display: 'inline-flex',
    alignItems: 'center',
    boxSizing: 'border-box',
    minHeight: 20,
    maxWidth: '100%',
    paddingTop: 2,
    paddingBottom: 2,
    paddingLeft: theme.spacing(0.75),
    paddingRight: theme.spacing(0.75),
    borderRadius: theme.shape.borderRadius,
    fontSize: 11,
    lineHeight: 1.3,
    backgroundColor: theme.palette.action.selected,
    color: 'var(--bui-fg-secondary)',
  },
  // A default can be a long JSON object or URL; the list clips what
  // overflows it, so the value wraps instead of running out of sight.
  pillValue: {
    display: 'inline',
    minWidth: 0,
    whiteSpace: 'normal',
    overflowWrap: 'anywhere',
  },
  pillRequired: {
    backgroundColor: 'transparent',
    border: '1px solid var(--bui-border-1)',
    color: theme.palette.warning.dark,
  },
}));

/** A section of the tab: a small heading, then what it says. */
function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  const classes = useStyles();
  return (
    <section className={classes.section} aria-label={title}>
      <SectionHeader
        as="h2"
        variant="title-x-small"
        title={title}
        description={description}
      />
      {children}
    </section>
  );
}

/** The workflow's inputs as a friendly list: name, type, required, default. */
function ArgumentsList({ workflow }: { workflow: MusterWorkflow }) {
  const classes = useStyles();
  const entries = Object.entries(workflow.getArgs());
  if (entries.length === 0) {
    return (
      <Text as="p" variant="body-medium" color="secondary">
        This workflow takes no inputs.
      </Text>
    );
  }
  return (
    <div className={classes.argList}>
      {entries.map(([name, def]) => (
        <div key={name} className={classes.argRow}>
          <div className={classes.argHead}>
            <code className={classes.mono}>{name}</code>
            <span className={classes.pill}>{def.type ?? 'string'}</span>
            {def.required && (
              <span className={`${classes.pill} ${classes.pillRequired}`}>
                required
              </span>
            )}
            {def.default !== undefined && (
              <span className={classes.pill} data-testid="arg-default">
                <span className={classes.pillValue}>
                  default:{' '}
                  <code>
                    {typeof def.default === 'object'
                      ? JSON.stringify(def.default)
                      : String(def.default)}
                  </code>
                </span>
              </span>
            )}
          </div>
          {def.description && (
            <Text variant="body-small" color="secondary">
              {def.description}
            </Text>
          )}
        </div>
      ))}
    </div>
  );
}

export type WorkflowOverviewTabProps = {
  workflow: MusterWorkflow;
  installation?: string;
  /** Whether the muster session can read runs, for the flow's overlay. */
  hasSession: boolean;
  /** Where muster asks for a session, what to show above the sections. */
  sessionGate?: ReactNode;
  prefixes: ServerPrefixInfo[];
};

/**
 * The workflow page's Overview tab (its index): what the workflow is for,
 * when it was created, what it needs and how it runs — the flow canvas,
 * coloured by the last run, a step expanding in place to its details.
 */
export function WorkflowOverviewTab({
  workflow,
  installation,
  hasSession,
  sessionGate,
  prefixes,
}: WorkflowOverviewTabProps) {
  const classes = useStyles();
  const description = workflow.getDescription();
  const created = workflow.getCreatedTimestamp();
  const validationErrors = workflow.getValidationErrors();

  return (
    <div className={classes.sections}>
      {sessionGate}
      {workflow.hasValidationWarning() && (
        <Alert
          status="warning"
          description={
            <>
              muster's validator flagged this definition. The workflow can still
              run.
              {validationErrors.length > 0 && (
                <ul style={{ margin: '4px 0 0', paddingLeft: 20 }}>
                  {validationErrors.map(error => (
                    <li key={error}>{error}</li>
                  ))}
                </ul>
              )}
            </>
          }
        />
      )}

      <Section title="What it’s for">
        {description ? (
          // Plain text, not GSMarkdownContent: the definition's description
          // is a sentence, and the page renders it as written.
          <Text as="p" variant="body-medium" className={classes.description}>
            {description}
          </Text>
        ) : (
          <Text as="p" variant="body-medium" color="secondary">
            Its definition gives no description.
          </Text>
        )}
        {created && (
          <Text as="p" variant="body-small" color="secondary">
            Created <DateComponent value={created} relative tooltip />
          </Text>
        )}
      </Section>

      <Section
        title="What it needs"
        description="An agent passes these inputs when running it."
      >
        <ArgumentsList workflow={workflow} />
      </Section>

      <Section
        title="How it runs"
        description="Steps in order. A step whose condition does not hold is skipped — there is no branching."
      >
        <WorkflowFlowCanvas
          name={workflow.getName()}
          steps={workflow.getSteps()}
          onFailure={workflow.getOnFailureSteps()}
          prefixes={prefixes}
          installation={installation}
          hasSession={hasSession}
        />
      </Section>
    </div>
  );
}
