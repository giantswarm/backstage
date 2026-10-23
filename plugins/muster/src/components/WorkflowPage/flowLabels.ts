import { formatDuration } from '../../lib/formatDuration';
import { ServerPrefixInfo } from '../../lib/toolGrouping';
import { toolDisplay } from '../../lib/workflowDisplay';
import {
  type FlowStepNode,
  paginateLabel,
  type StepRunOverlay,
} from '../../lib/workflowGraph';

/**
 * The words both step views — the flow canvas and its phone list — put on a
 * step: what it calls, how its last run went, and its accessible name.
 */

/** The plain line under a step's name: connector · tool, and its tile glyph. */
export function toolLine(
  tool: string | undefined,
  prefixes: ServerPrefixInfo[],
): { glyph: string; line: string } {
  if (!tool) {
    return { glyph: '·', line: '' };
  }
  const display = toolDisplay(tool, prefixes);
  switch (display.kind) {
    case 'connector':
      return {
        glyph: display.connector.charAt(0).toUpperCase(),
        line: `${display.connector} · ${display.tool}`,
      };
    case 'core':
      return { glyph: 'M', line: `muster · ${display.tool}` };
    case 'workflow':
      return { glyph: 'W', line: `Runs the workflow ${display.workflow}` };
    default:
      return {
        glyph: display.tool.charAt(0).toUpperCase(),
        line: display.tool,
      };
  }
}

/** A step's last-run badge text: "✓ ×3 1.2s", "✕ Failed", "Skipped"… */
export function runBadgeLabel(overlay: StepRunOverlay): string {
  switch (overlay.status) {
    case 'completed': {
      const parts = ['✓'];
      if (overlay.runs > 1) parts.push(`×${overlay.runs}`);
      if (overlay.durationMs !== undefined) {
        parts.push(formatDuration(overlay.durationMs));
      }
      return parts.join(' ');
    }
    case 'failed':
      return '✕ Failed';
    case 'running':
      return 'Running';
    case 'skipped':
      return 'Skipped';
    case 'notRun':
    default:
      return 'Not run';
  }
}

/** The badge in words, for a step's accessible name. */
export function runSpoken(overlay: StepRunOverlay): string {
  switch (overlay.status) {
    case 'completed':
      return overlay.runs > 1
        ? `last run succeeded ${overlay.runs} times`
        : 'last run succeeded';
    case 'failed':
      return 'last run failed';
    case 'running':
      return 'running';
    case 'skipped':
      return 'skipped in the last run';
    case 'notRun':
    default:
      return 'did not run in the last run';
  }
}

/** Whether the last run passed the step by: drawn quieter. */
export function quietStatus(overlay?: StepRunOverlay): boolean {
  return overlay?.status === 'skipped' || overlay?.status === 'notRun';
}

/** A step's feature markers in words, for its accessible name. */
export function featureWords(
  node: Pick<FlowStepNode, 'paginate' | 'jq'>,
): string[] {
  return [
    ...(node.paginate ? [paginateLabel(node.paginate).toLowerCase()] : []),
    ...(node.jq ? ['result reshaped with jq'] : []),
  ];
}

/** "Step 2: Apply the manifests, kubernetes · apply, last run failed". */
export function accessibleName(
  node: FlowStepNode,
  parts: (string | undefined | false)[],
): string {
  const head = node.lane === 'cleanup' ? 'Cleanup step' : `Step ${node.number}`;
  return [`${head}: ${node.title}`, ...parts].filter(Boolean).join(', ');
}
