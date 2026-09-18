import type {
  ModelManagerFitResult,
  ModelManagerLoadAnswer,
  ModelManagerServeStep,
} from './modelManager';
import { formatBytes } from './modelManagerServing';
import type { ServedModel } from './serving';

/**
 * Serving through model-manager as the signed-in person: what the Serve
 * dialog shows of `check_fit`'s verdict before the button, what the toast
 * says of `load_model`'s answer after it, and the route the pool panel opens
 * the dialog with. Pure — the wire shapes are `lib/modelManager`'s.
 */

/** The sizes of a fit verdict in words: download, requirement, the node's budget. */
export function describeFit(fit: ModelManagerFitResult): string {
  const parts: string[] = [];
  if (fit.downloadBytes !== undefined) {
    parts.push(`Download ${formatBytes(fit.downloadBytes)}`);
  }
  if (fit.requiredBytes !== undefined) {
    const breakdown =
      fit.weightsBytes !== undefined && fit.overheadBytes !== undefined
        ? ` (${formatBytes(fit.weightsBytes)} of weights${
            fit.weightsSource ? ` per ${fit.weightsSource}` : ''
          } + ${formatBytes(fit.overheadBytes)} of serving headroom)`
        : '';
    parts.push(`needs ${formatBytes(fit.requiredBytes)}${breakdown}`);
  }
  if (fit.node && fit.budgetBytes !== undefined) {
    const free =
      fit.freeBytes !== undefined
        ? `${formatBytes(fit.freeBytes)} free of `
        : '';
    parts.push(
      `${fit.node} has ${free}${formatBytes(fit.budgetBytes)}${
        fit.budgetSource ? ` (${fit.budgetSource})` : ''
      }`,
    );
  }
  return parts.join('; ');
}

/**
 * The cache line of a verdict. `cached` is a boolean on the wire, but only a
 * `cacheSource` of `scan` or `index` makes `false` a verdict (model-manager
 * 0.24.0): without one — or with `unknown` — the weights may well be there.
 */
export function describeCache(
  fit: Pick<ModelManagerFitResult, 'cached' | 'cacheSource'>,
): string {
  if (fit.cached) {
    return `weights cached${fit.cacheSource ? ` (${fit.cacheSource})` : ''}`;
  }
  if (fit.cacheSource === 'scan' || fit.cacheSource === 'index') {
    return 'weights not cached — downloaded when the node starts';
  }
  return 'cache state unknown';
}

export type FitVerdict = {
  fits: boolean;
  /** One line: "Fits — the node comes as g6.xlarge", or the refusal's reason. */
  summary: string;
  /** The cache line and the sizes, for the line under the summary. */
  details: string[];
};

/** `check_fit`'s answer as the dialog shows it before the Serve button. */
/** Where a fitting model runs: the instance type the node comes as, else the node it is on. */
function describeWhere(fit: ModelManagerFitResult): string | undefined {
  if (fit.instanceType) {
    return `the node comes as ${fit.instanceType}`;
  }
  return fit.node ? `on ${fit.node}` : undefined;
}

export function describeFitVerdict(fit: ModelManagerFitResult): FitVerdict {
  const sizes = describeFit(fit);
  if (!fit.fits) {
    return {
      fits: false,
      summary: fit.reason ?? 'Does not fit',
      details: sizes ? [sizes] : [],
    };
  }
  const where = describeWhere(fit);
  return {
    fits: true,
    summary: where ? `Fits — ${where}` : 'Fits',
    details: [describeCache(fit), sizes].filter(Boolean),
  };
}

/** The step under way (or the one that failed), first in order; none once every step is done. */
export function currentStep(
  steps: ModelManagerServeStep[] | undefined,
): ModelManagerServeStep | undefined {
  return steps?.find(
    step => step.state === 'inProgress' || step.state === 'failed',
  );
}

/** One step in words: its name and what model-manager says about it. */
export function describeStep(step: ModelManagerServeStep): string {
  const what = step.message ?? step.reason ?? step.state;
  return what ? `${step.name}: ${what}` : step.name;
}

/**
 * `load_model`'s answer in one line for the toast: the object created, the
 * fit it was judged by and the step under way — the timeline itself is the
 * served model's row.
 */
export function describeLoadAnswer(answer: ModelManagerLoadAnswer): string {
  const parts: string[] = [];
  const running = answer.running;
  if (running?.resource) {
    parts.push(`${running.kind ?? 'LLMInferenceService'} ${running.resource}`);
  }
  if (answer.fit) {
    const verdict = describeFitVerdict(answer.fit);
    parts.push(verdict.summary);
    if (verdict.fits) {
      parts.push(describeCache(answer.fit));
    }
  }
  const step = currentStep(running?.steps);
  if (step) {
    parts.push(describeStep(step));
  } else if (running?.status) {
    parts.push(
      running.reason ? `${running.status} · ${running.reason}` : running.status,
    );
  }
  return parts.join(' · ');
}

/**
 * The route the pool panel opens the Serve dialog with:
 * `?serve=1&installation=<installation>&cluster=<cluster>&pool=<pool name>`
 * — installation, cluster and pool preselected — and, when the pool carries a
 * serve intent (the preset chosen on the Add GPU node pool form),
 * `&preset=<preset name>`, so the person never picks it twice. Read once and
 * stripped, so a reload does not reopen the dialog.
 */
export type ServeRoute = {
  installation?: string;
  cluster?: string;
  pool?: string;
  /** The preset name to preselect (`LoadModelSeed.model`). */
  preset?: string;
};

export const SERVE_ROUTE_PARAMS = [
  'serve',
  'installation',
  'cluster',
  'pool',
  'preset',
] as const;

export function parseServeRoute(
  params: URLSearchParams,
): ServeRoute | undefined {
  if (params.get('serve') !== '1') {
    return undefined;
  }
  const value = (name: string) => params.get(name)?.trim() || undefined;
  return {
    installation: value('installation'),
    cluster: value('cluster'),
    pool: value('pool'),
    preset: value('preset'),
  };
}

/** The same params without the serve route, for the URL after the dialog opened. */
export function withoutServeRoute(params: URLSearchParams): URLSearchParams {
  const next = new URLSearchParams(params);
  for (const name of SERVE_ROUTE_PARAMS) {
    next.delete(name);
  }
  return next;
}

/**
 * The model id a try of a served model sends in its completion: what the
 * ModelConfig sends the provider (`spec.model` — on a vLLM predictor the name
 * the model is served under, the Hugging Face repository), else the model's
 * source reference, else the serving object's name. The serving object's
 * name alone is not it: vLLM answers 404 "The model `<name>` does not exist"
 * for a name it does not serve under.
 */
export function tryModelIdOf(
  row: Pick<ServedModel, 'name' | 'modelSource' | 'modelConfig'>,
): string {
  return row.modelConfig?.model ?? row.modelSource ?? row.name;
}
