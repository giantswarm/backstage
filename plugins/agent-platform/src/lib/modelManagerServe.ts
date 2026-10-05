import type {
  ModelManagerFitResult,
  ModelManagerLoadAnswer,
  ModelManagerNode,
  ModelManagerPlacement,
  ModelManagerServeStep,
} from './modelManager';
import { formatBytes } from './formatNumbers';
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
  // 0 is nothing to fetch: a model image the node holds already.
  if (fit.downloadBytes) {
    parts.push(`Download ${formatBytes(fit.downloadBytes)}`);
  }
  // Several nodes: a split's share, or a whole copy, on each of them.
  const perNode =
    fit.nodes && fit.nodes.length > 1 ? fit.nodes.length : undefined;
  const splitWays = fit.placement === 'split' ? perNode : undefined;
  if (fit.requiredBytes !== undefined) {
    // A split's requirement is per node: its share of the weights and the
    // headroom (model-manager reports the whole model's weights); a copy's
    // is the whole model on each node.
    const weights =
      fit.weightsBytes !== undefined
        ? `${formatBytes(fit.weightsBytes)} of weights${
            splitWays ? ` split ${splitWays} ways` : ''
          }${fit.weightsSource ? ` per ${fit.weightsSource}` : ''}`
        : undefined;
    const breakdown =
      weights && fit.overheadBytes !== undefined
        ? ` (${weights} + ${formatBytes(fit.overheadBytes)} of serving headroom)`
        : '';
    parts.push(
      `needs ${formatBytes(fit.requiredBytes)}${
        perNode ? ` on each of ${perNode} nodes` : ''
      }${breakdown}`,
    );
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
  if (fit.cacheSource === 'oci-image') {
    return 'served from the model image';
  }
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

/** "A, B and C". */
function listNames(names: string[]): string {
  return names.length === 1
    ? names[0]
    : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

/** "Split across A and B", the words for a split's nodes. */
export function describeSplit(nodes: string[] | undefined): string {
  if (!nodes || nodes.length === 0) {
    return 'Split across nodes';
  }
  return `Split across ${listNames(nodes)}`;
}

/** "2 copies on A and B", the words for copies on several nodes. */
export function describeCopies(nodes: string[]): string {
  return `${nodes.length} copies on ${listNames(nodes)}`;
}

/**
 * What the Serve request pins a copy to: the node the person chose, or none
 * — then the nodes any of which it may land on, when they are known.
 */
export type FitPlacement = {
  /** The node `load_model` pins the predictor to. */
  node?: string;
  /** Unpinned: the nodes that host the model, one of which the scheduler picks. */
  fittingNodes?: string[];
};

/**
 * Where a fitting model runs: across a split's nodes, the instance type the
 * node comes as, the node the request pins, else the nodes it may land on.
 * An unpinned copy never names the one node `check_fit` happened to judge:
 * the scheduler, not the check, places it.
 */
function describeWhere(
  fit: ModelManagerFitResult,
  { node, fittingNodes }: FitPlacement,
): string | undefined {
  if (fit.placement === 'split') {
    const where = describeSplit(fit.nodes).replace(/^Split/, 'split');
    return fit.fastLink
      ? `— ${where} (fast link ${fit.fastLink})`
      : `— ${where}`;
  }
  if (fit.nodes && fit.nodes.length > 1) {
    return `as ${describeCopies(fit.nodes)}`;
  }
  if (fit.instanceType) {
    return `— the node comes as ${fit.instanceType}`;
  }
  if (node) {
    return `— will be placed on ${node}`;
  }
  return fittingNodes?.length ? `on ${listNames(fittingNodes)}` : undefined;
}

/** `check_fit`'s answer as the dialog shows it before the Serve button. */
export function describeFitVerdict(
  fit: ModelManagerFitResult,
  placement: FitPlacement = {},
): FitVerdict {
  const sizes = describeFit(fit);
  if (!fit.fits) {
    return {
      fits: false,
      summary: fit.reason ?? 'Does not fit',
      details: sizes ? [sizes] : [],
    };
  }
  const where = describeWhere(fit, placement);
  return {
    fits: true,
    summary: where ? `Fits ${where}` : 'Fits',
    details: [describeCache(fit), sizes].filter(Boolean),
  };
}

/** One option of the Serve dialog's placement choice. */
export type PlacementChoice = {
  id: ModelManagerPlacement;
  label: string;
  /** Why it is recommended, or why it cannot be chosen. */
  description?: string;
  recommended: boolean;
  disabled: boolean;
};

/** Why a split is recommended — the fast link — or why it cannot be chosen. */
function describeSplitChoice(
  split: ModelManagerFitResult | undefined,
): string | undefined {
  if (split && !split.fits) {
    return split.reason ?? 'No fast-linked nodes host this model';
  }
  return split?.fastLink
    ? `These nodes share the fast link ${split.fastLink}.`
    : undefined;
}

/** The copies choice in words: one copy anywhere, on a node, or one on each. */
function copiesLabel(nodes: string[]): string {
  if (nodes.length === 0) {
    return 'One copy';
  }
  if (nodes.length === 1) {
    return `One copy on ${nodes[0]}`;
  }
  return `${describeCopies(nodes)} — more people served at once`;
}

/**
 * The placement choice of the Serve dialog from the default fit (copies,
 * carrying model-manager's recommendation) and the split fit: none when the
 * backend recommends nothing (no placement before model-manager#190, or a
 * host backend). Split is offered only when it fits, else disabled with
 * model-manager's reason. Copies go on the nodes the person ticked — one
 * each — or, none ticked, one copy on a node that fits.
 */
export function placementChoices(
  copies: ModelManagerFitResult | undefined,
  split: ModelManagerFitResult | undefined,
  /** The nodes the person ticked for the copies, if any. */
  nodes: string[] = [],
): PlacementChoice[] | undefined {
  const recommended = copies?.recommended;
  if (!recommended) {
    return undefined;
  }
  const splitFits = split?.fits === true;
  return [
    {
      id: 'split',
      label: split?.nodes?.length
        ? `${describeSplit(split.nodes)} — one model, faster answers, longer context`
        : 'Split across fast-linked nodes',
      description: describeSplitChoice(split),
      recommended: recommended === 'split',
      // Unjudged yet, a recommended split stays chosen (its pending check
      // holds the Serve button); judged, it is offered only when it fits.
      disabled: split ? !splitFits : recommended !== 'split',
    },
    {
      id: 'copies',
      label: copiesLabel(nodes),
      recommended: recommended === 'copies',
      // Ticked nodes are each judged already (the Nodes field).
      disabled: nodes.length === 0 && copies?.fits !== true,
    },
  ];
}

/** One option of the Serve dialog's Nodes field. */
export type NodeChoice = {
  id: string;
  label: string;
  /** The free budget, or why the preset cannot land there. */
  description?: string;
  /** Not ready, not a serving target for this preset, or it does not fit. */
  disabled: boolean;
};

/** A preset served from a model image (`oci://`) rather than Hugging Face weights. */
export function isModelImagePreset(storageUri: string | undefined): boolean {
  return Boolean(storageUri?.startsWith('oci://'));
}

/**
 * Whether the backend places this preset on the node: an eligible node, or
 * for a model-image preset one whose only failing rule is the cache-claim
 * pin (`modelImageEligible`).
 */
export function servesPresetOn(
  node: Pick<ModelManagerNode, 'ready' | 'eligible' | 'modelImageEligible'>,
  modelImage: boolean,
): boolean {
  return (
    node.ready &&
    (node.eligible !== false ||
      (modelImage && node.modelImageEligible === true))
  );
}

/**
 * The nodes the Node field lists: every node the preset can serve on, and
 * the GPU nodes it cannot (disabled, with the reason) — not the cluster's
 * plain workers, which only a node selector would ever change.
 */
export function nodeCandidates(
  nodes: ModelManagerNode[],
  modelImage: boolean,
): ModelManagerNode[] {
  return nodes.filter(
    node => servesPresetOn(node, modelImage) || (node.gpuCount ?? 0) > 0,
  );
}

function whyNotOn(
  node: ModelManagerNode,
  fit: ModelManagerFitResult | undefined,
  modelImage: boolean,
): string | undefined {
  if (!node.ready) {
    return 'not ready';
  }
  if (!servesPresetOn(node, modelImage)) {
    return `not a serving target: ${
      node.eligibilityReason ?? 'the serving layer gave no reason'
    }`;
  }
  if (fit && !fit.fits) {
    return fit.reason ?? 'does not fit';
  }
  return undefined;
}

/**
 * The Nodes field: each candidate with its free budget — or, disabled, why
 * the preset cannot land there. `fits` is `check_fit` pinned to each node; a
 * node still being judged is offered.
 */
export function nodeChoices(
  nodes: ModelManagerNode[],
  fits: Record<string, ModelManagerFitResult | undefined>,
  options: { modelImage: boolean; prePulledNodes?: string[] },
): NodeChoice[] {
  return nodes.map(node => {
    const why = whyNotOn(node, fits[node.name], options.modelImage);
    if (why) {
      return {
        id: node.name,
        label: node.name,
        description: why,
        disabled: true,
      };
    }
    const free =
      node.freeBytes !== undefined && node.budgetBytes !== undefined
        ? `${formatBytes(node.freeBytes)} free of ${formatBytes(node.budgetBytes)}`
        : undefined;
    const pulled = options.prePulledNodes?.includes(node.name)
      ? 'model image pulled'
      : undefined;
    return {
      id: node.name,
      label: node.name,
      description: [free, pulled].filter(Boolean).join(' · ') || undefined,
      disabled: false,
    };
  });
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

/** The states in which a served object for a preset exists on the backend. */
const SERVING_STATES: ReadonlySet<ServedModel['readiness']> = new Set([
  'ready',
  'notReady',
  'pending',
  'starting',
  'terminating',
]);

/**
 * The served row of a preset on an installation's backend, if it serves
 * already: model-manager serves each preset once, so the Serve dialog shows
 * where instead of offering it again.
 */
export function servedPresetRow(
  models: ServedModel[],
  installation: string,
  backend: string | undefined,
  preset: string,
): ServedModel | undefined {
  return models.find(
    model =>
      model.installation === installation &&
      (!backend || model.backend === backend) &&
      model.preset === preset &&
      SERVING_STATES.has(model.readiness),
  );
}

/** Where a served row runs, in words: `Serving on gpu-a`, `Stopping on gpu-a`. */
export function describeServedWhere(row: ServedModel): string {
  const verb = row.readiness === 'terminating' ? 'Stopping' : 'Serving';
  const several = row.splitNodes ?? row.copyNodes;
  const nodes = several?.length ? several.join(', ') : row.node;
  return nodes ? `${verb} on ${nodes}` : `${verb} already`;
}

/** The nodes a load answer serves on: an existing object's, else the fit's. */
export function loadAnswerNodes(answer: ModelManagerLoadAnswer): string[] {
  if (answer.servingNodes?.length) {
    return answer.servingNodes;
  }
  if (answer.fit?.nodes?.length) {
    return answer.fit.nodes;
  }
  return answer.fit?.node ? [answer.fit.node] : [];
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
