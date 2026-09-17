import { StatusLabelIntent } from '@giantswarm/backstage-plugin-ui-react';
import { SetupResult, SetupStep } from '../apis';

/**
 * What `devctl repo status` prints for a set-up result, field by field, so
 * the page shows the same thing as the CLI for the same record
 * (`setup.checks` is that result): the header's converged state, one line
 * per step with its verdict and detail, then the findings with their fix.
 */

/** The header state: `converged` | `not converged`. */
export function convergedState(result: SetupResult): string {
  return result.converged ? 'converged' : 'not converged';
}

/**
 * A step's detail as the CLI's DETAIL column: the summary, the changes
 * joined by `; ` and the findings count, separated by ` | `.
 */
export function stepDetail(step: SetupStep): string {
  const parts: string[] = [];
  if (step.summary) {
    parts.push(step.summary);
  }
  if (step.changes && step.changes.length > 0) {
    parts.push(step.changes.join('; '));
  }
  const findings = step.findings?.length ?? 0;
  if (findings === 1) {
    parts.push('1 finding');
  } else if (findings > 1) {
    parts.push(`${findings} findings`);
  }
  return parts.join(' | ');
}

/** Every step's findings, in step order (the CLI's Findings section). */
export function resultFindings(result: SetupResult) {
  return result.steps.flatMap(step => step.findings ?? []);
}

/**
 * What a step's verdict means, for the status icon next to the word: `ok`
 * and `repaired` are good, `drift` wants the reconciler, `reported` left a
 * finding for a person, `skipped` did not apply, `failed` could not run.
 */
export const VERDICT_INTENT: Record<string, StatusLabelIntent> = {
  ok: 'positive',
  repaired: 'positive',
  drift: 'warning',
  reported: 'info',
  skipped: 'neutral',
  failed: 'negative',
};

export function verdictIntent(verdict: string): StatusLabelIntent {
  return VERDICT_INTENT[verdict] ?? 'neutral';
}

/** The steps still pending in a set-up that has not converged. */
export function stepsNotOk(result: SetupResult): SetupStep[] {
  return result.steps.filter(
    step => step.verdict !== 'ok' && step.verdict !== 'skipped',
  );
}
