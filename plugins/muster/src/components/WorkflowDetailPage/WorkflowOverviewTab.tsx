import {
  Box,
  Typography,
  makeStyles,
  useTheme,
  Theme,
} from '@material-ui/core';
import BarChart from '@material-ui/icons/BarChart';
import Tune from '@material-ui/icons/Tune';
import FormatListNumbered from '@material-ui/icons/FormatListNumbered';
import Share from '@material-ui/icons/Share';
import AccountTree from '@material-ui/icons/AccountTree';
import { Alert } from '@material-ui/lab';
import { Link } from '@backstage/core-components';
import { useRouteRef } from '@backstage/frontend-plugin-api';
import { MusterWorkflow } from '../../lib/k8s';
import { findReferencedBy } from '../../lib/workflowReferences';
import { workflowDetailRouteRef } from '../../routes';
import { SectionHeader, VIOLET } from '../shared';
import { WorkflowStepCard } from './WorkflowStepCard';
import { WorkflowStatsPanel } from './WorkflowStatsPanel';

const useStyles = makeStyles((theme: Theme) => ({
  section: {
    paddingTop: theme.spacing(4),
    paddingBottom: theme.spacing(4),
    borderBottom: `1px solid ${theme.palette.divider}`,
    '&:last-child': {
      borderBottom: 'none',
    },
  },
  // Arguments list (mockup `divide-y rounded-lg border`).
  argList: {
    border: `1px solid ${theme.palette.divider}`,
    borderRadius: theme.shape.borderRadius * 2,
    overflow: 'hidden',
  },
  argRow: {
    display: 'flex',
    flexDirection: 'column',
    gap: theme.spacing(0.5),
    padding: theme.spacing(1.25, 1.5),
    borderTop: `1px solid ${theme.palette.divider}`,
    '&:first-child': { borderTop: 'none' },
    [theme.breakpoints.up('sm')]: {
      flexDirection: 'row',
      alignItems: 'baseline',
      gap: theme.spacing(1.5),
    },
  },
  argHead: {
    flexShrink: 0,
    display: 'flex',
    alignItems: 'center',
    gap: theme.spacing(1),
  },
  argName: {
    fontFamily: 'monospace',
    fontSize: 13,
    fontWeight: 500,
  },
  badge: {
    display: 'inline-flex',
    alignItems: 'center',
    height: 20,
    paddingLeft: theme.spacing(0.75),
    paddingRight: theme.spacing(0.75),
    borderRadius: theme.shape.borderRadius,
    fontSize: 11,
    lineHeight: 1,
    whiteSpace: 'nowrap',
  },
  badgeType: {
    backgroundColor: theme.palette.action.selected,
    color: theme.palette.text.secondary,
  },
  badgeRequired: {
    border: `1px solid ${theme.palette.divider}`,
    color: theme.palette.warning.dark,
  },
  argDescription: {
    color: theme.palette.text.secondary,
  },
  refList: {
    border: `1px solid ${theme.palette.divider}`,
    borderRadius: theme.shape.borderRadius * 2,
    overflow: 'hidden',
  },
  refRow: {
    display: 'flex',
    alignItems: 'center',
    gap: theme.spacing(1),
    padding: theme.spacing(1.25, 1.5),
    borderTop: `1px solid ${theme.palette.divider}`,
    '&:first-child': { borderTop: 'none' },
    '& svg': { fontSize: 14, color: VIOLET, flexShrink: 0 },
  },
  refLink: {
    fontFamily: 'monospace',
    fontSize: 13,
  },
}));

/** Append `?installation=` to a route path so deep links keep the instance. */
function withInstallation(base: string, installation?: string): string {
  if (!installation) {
    return base;
  }
  return `${base}?installation=${encodeURIComponent(installation)}`;
}

/**
 * The workflow page's index: what the workflow does and how often it runs --
 * validation, statistics, arguments, steps and the workflows calling it.
 */
export function WorkflowOverviewTab({
  workflow,
  workflows,
  installation,
}: {
  workflow: MusterWorkflow;
  /** The installation's workflows, for "Referenced by". */
  workflows: MusterWorkflow[];
  installation?: string;
}) {
  const classes = useStyles();
  const theme = useTheme();
  const workflowDetailLink = useRouteRef(workflowDetailRouteRef);

  const name = workflow.getName();
  const argEntries = Object.entries(workflow.getArgs());
  const steps = workflow.getSteps();
  const stepIds = steps.map(s => s.id);
  const referencedBy = findReferencedBy(name, workflows);
  const validationErrors = workflow.getValidationErrors();
  const referencingTool = `workflow_${name}`;

  return (
    <Box>
      {workflow.hasValidationWarning() && (
        <Alert severity="warning" style={{ marginTop: theme.spacing(2) }}>
          muster's validator flagged this workflow's definition. It can still be
          run — this is a non-blocking warning, not an availability state.
          {validationErrors.length > 0 && (
            <ul style={{ margin: '4px 0 0', paddingLeft: 20 }}>
              {validationErrors.map(err => (
                <li key={err}>{err}</li>
              ))}
            </ul>
          )}
        </Alert>
      )}

      {/* Statistics */}
      <Box className={classes.section}>
        <SectionHeader
          icon={<BarChart />}
          title="Statistics"
          description="How often this workflow runs and how reliably, over a recent sample of executions recorded by muster's workflow engine."
        />
        <WorkflowStatsPanel name={name} installation={installation} />
      </Box>

      {/* Arguments */}
      <Box className={classes.section}>
        <SectionHeader
          icon={<Tune />}
          title="Arguments"
          description="Inputs the workflow takes when an agent invokes it."
        />
        {argEntries.length === 0 ? (
          <Typography variant="body2" color="textSecondary">
            This workflow takes no arguments.
          </Typography>
        ) : (
          <Box className={classes.argList}>
            {argEntries.map(([argName, def]) => (
              <Box key={argName} className={classes.argRow}>
                <Box className={classes.argHead}>
                  <code className={classes.argName}>{argName}</code>
                  <span className={`${classes.badge} ${classes.badgeType}`}>
                    {def.type ?? 'string'}
                  </span>
                  {def.required && (
                    <span
                      className={`${classes.badge} ${classes.badgeRequired}`}
                    >
                      required
                    </span>
                  )}
                </Box>
                {def.description && (
                  <Typography
                    variant="body2"
                    className={classes.argDescription}
                  >
                    {def.description}
                  </Typography>
                )}
              </Box>
            ))}
          </Box>
        )}
      </Box>

      {/* Steps */}
      <Box className={classes.section}>
        <SectionHeader
          icon={<FormatListNumbered />}
          title="Steps"
          description="The ordered tool calls muster runs. Each step names the aggregated tool it invokes and the arguments passed to it."
        />
        {steps.length === 0 ? (
          <Typography variant="body2" color="textSecondary">
            This workflow defines no steps.
          </Typography>
        ) : (
          steps.map((step, index) => (
            <WorkflowStepCard
              key={step.id}
              step={step}
              index={index}
              installation={installation}
              stepIds={stepIds}
            />
          ))
        )}
      </Box>

      {/* Referenced by */}
      {referencedBy.length > 0 && (
        <Box className={classes.section}>
          <SectionHeader
            icon={<Share />}
            title="Referenced by"
            description={`Other workflows that call this one as a step — muster exposes it as the tool ${referencingTool}.`}
          />
          <Box className={classes.refList}>
            {referencedBy.map(ref => (
              <Box
                key={`${ref.cluster}/${ref.getName()}`}
                className={classes.refRow}
              >
                <AccountTree />
                <Link
                  to={withInstallation(
                    workflowDetailLink?.({ name: ref.getName() }) ?? '#',
                    ref.cluster,
                  )}
                  className={classes.refLink}
                >
                  {ref.getName()}
                </Link>
              </Box>
            ))}
          </Box>
        </Box>
      )}
    </Box>
  );
}
