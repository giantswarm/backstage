import CheckCircleIcon from '@material-ui/icons/CheckCircle';
import ErrorIcon from '@material-ui/icons/Error';
import HourglassEmptyIcon from '@material-ui/icons/HourglassEmpty';
import ReportProblemIcon from '@material-ui/icons/ReportProblem';
import type { StatusLabelIntent } from '@giantswarm/backstage-plugin-ui-react';
import type { AgentReadiness } from '@giantswarm/backstage-plugin-kubernetes-react';

/**
 * How each readiness state presents. `Failed` is the word the Harness rows and
 * agent-manager's `get_agent_status` use for the same verdict.
 *
 * Icons are named explicitly rather than relying on `StatusLabel`'s per-intent
 * defaults: `pending` reads far better as an hourglass than as the neutral
 * default circle, and naming the others keeps the whole set visible in one
 * place.
 *
 * `pending` is deliberately `neutral` rather than a warning: it means the
 * controller has not caught up with the current spec yet, which is "not known
 * yet", not "broken".
 */
/** How one readiness is shown: its label, the label's intent and its icon. */
export type ReadinessPresentation = {
  label: string;
  intent: StatusLabelIntent;
  icon: typeof CheckCircleIcon;
};

export const READINESS_PRESENTATION: Record<
  AgentReadiness,
  ReadinessPresentation
> = {
  ready: { label: 'Ready', intent: 'positive', icon: CheckCircleIcon },
  notReady: { label: 'Not ready', intent: 'warning', icon: ReportProblemIcon },
  failed: { label: 'Failed', intent: 'negative', icon: ErrorIcon },
  pending: { label: 'Pending', intent: 'neutral', icon: HourglassEmptyIcon },
};
