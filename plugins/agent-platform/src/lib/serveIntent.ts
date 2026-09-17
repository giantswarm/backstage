import type { LifecycleStep } from './lifecycle';
import { modelLifecycleSteps, modelPhaseLabel } from './modelLifecycle';
import type { ModelManagerFitResult } from './modelManager';
import { describeFitVerdict } from './modelManagerServe';
import type { ServedModel } from './serving';

/**
 * A GPU node pool's **serve intent**: the preset chosen under *I want to
 * serve* on the Add GPU node pool form, carried past Deploy so the portal
 * serves it once the serving stack is ready (giantswarm/backstage#2437). The
 * intent is persisted in the browser per installation/cluster/pool together
 * with the outcome of the one `load_model`, so a reload keeps the step and
 * its state and the load is never made twice; a served model of that preset
 * on the cluster marks it done, Remove clears it. Pure — the store is
 * `hooks/useServeIntents`, the one call `hooks/useServeIntentRunner`, the
 * step's rendering `PoolLifecyclePanel`.
 */

/** The preset chosen on the form, as the pool's Deploy hands it on. */
export type ServeChoice = {
  /** The preset name — what `check_fit` and `load_model` take as `model`. */
  preset: string;
  /** The preset's name for people (`Qwen3 8B FP8`). */
  displayName?: string;
  /** The model the preset serves (`Qwen/Qwen3-8B-FP8`). */
  model?: string;
};

/** How the intent's one `load_model` ended, persisted with it. */
export type ServeIntentOutcome =
  | {
      kind: 'served';
      /** The serving object model-manager composed (`running.resource`), or the preset's model on the cluster. */
      resource: string;
      /** RFC3339: when the load was accepted (or the served model was found). */
      at: string;
      /** RFC3339: when the served model was first seen ready. */
      ready?: string;
    }
  | {
      kind: 'refused';
      /** `check_fit`'s reason, verbatim. */
      reason: string;
      /** The verdict's sizes, for the line under the reason. */
      details: string[];
      at: string;
    }
  | {
      kind: 'failed';
      /** What `load_model` threw, verbatim. */
      message: string;
      at: string;
    };

export type ServeIntent = ServeChoice & {
  installation: string;
  cluster: string;
  /** The pool name as given to `create_node_pool`. */
  poolName: string;
  /** RFC3339: when Deploy carried the choice here. */
  chosenAt: string;
  outcome?: ServeIntentOutcome;
};

/** The intents by pool id ({@link poolIdOf}). */
export type ServeIntents = Record<string, ServeIntent>;

/** Same `gs-` prefix as the plugin's other remembered UI state; per browser, not per user. */
export const SERVE_INTENTS_STORAGE_KEY = 'gs-agent-platform-serve-intents';

/** The kserve backend a GPU pool registers: what the intent is served on. */
export const SERVE_INTENT_BACKEND = 'kserve';

/**
 * An intent whose pool a settled list no longer carries this long after the
 * choice is stale (a pool removed outside the portal); a pool Deploy just
 * applied takes seconds to be listed.
 */
export const SERVE_INTENT_STALE_MS = 15 * 60_000;

export type PoolRef = {
  installation: string;
  cluster: string;
  poolName: string;
};

/**
 * `<installation>/<cluster>/<cluster>-<pool>` — the id `useGpuNodePools`
 * gives the pool's row (cluster-manager names the MachinePool
 * `<cluster>-<name>`), and the pool lifecycle panel's `OpenedPool.id`.
 */
export function poolIdOf(pool: PoolRef): string {
  return `${pool.installation}/${pool.cluster}/${pool.cluster}-${pool.poolName}`;
}

/** The intent Deploy records for a pool. */
export function newServeIntent(
  pool: PoolRef,
  choice: ServeChoice,
  now: string = new Date().toISOString(),
): ServeIntent {
  return {
    installation: pool.installation,
    cluster: pool.cluster,
    poolName: pool.poolName,
    preset: choice.preset,
    displayName: choice.displayName,
    model: choice.model,
    chosenAt: now,
  };
}

/** The preset's name for people: `displayName`, or the preset's id. */
export function serveChoiceLabel(
  choice: Pick<ServeChoice, 'preset' | 'displayName'>,
): string {
  return choice.displayName || choice.preset;
}

/** `Qwen3 8B FP8 (Qwen/Qwen3-8B-FP8)` — the label with the model where it adds something. */
export function describeServeChoice(choice: ServeChoice): string {
  const label = serveChoiceLabel(choice);
  return choice.model && choice.model !== label
    ? `${label} (${choice.model})`
    : label;
}

function isString(value: unknown): value is string {
  return typeof value === 'string' && value !== '';
}

function parseOutcome(value: unknown): ServeIntentOutcome | undefined {
  if (!value || typeof value !== 'object') {
    return undefined;
  }
  const raw = value as Record<string, unknown>;
  if (!isString(raw.at)) {
    return undefined;
  }
  switch (raw.kind) {
    case 'served':
      return isString(raw.resource)
        ? {
            kind: 'served',
            resource: raw.resource,
            at: raw.at,
            ...(isString(raw.ready) ? { ready: raw.ready } : {}),
          }
        : undefined;
    case 'refused':
      return isString(raw.reason)
        ? {
            kind: 'refused',
            reason: raw.reason,
            details: Array.isArray(raw.details)
              ? raw.details.filter(isString)
              : [],
            at: raw.at,
          }
        : undefined;
    case 'failed':
      return isString(raw.message)
        ? { kind: 'failed', message: raw.message, at: raw.at }
        : undefined;
    default:
      return undefined;
  }
}

function parseIntent(value: unknown): ServeIntent | undefined {
  if (!value || typeof value !== 'object') {
    return undefined;
  }
  const raw = value as Record<string, unknown>;
  if (
    !isString(raw.installation) ||
    !isString(raw.cluster) ||
    !isString(raw.poolName) ||
    !isString(raw.preset) ||
    !isString(raw.chosenAt)
  ) {
    return undefined;
  }
  return {
    installation: raw.installation,
    cluster: raw.cluster,
    poolName: raw.poolName,
    preset: raw.preset,
    displayName: isString(raw.displayName) ? raw.displayName : undefined,
    model: isString(raw.model) ? raw.model : undefined,
    chosenAt: raw.chosenAt,
    outcome: parseOutcome(raw.outcome),
  };
}

/**
 * The persisted intents, read tolerantly: what is not an intent of this
 * shape (an older portal's entry, a hand edit) is left out, never thrown on.
 * Every entry is filed under its pool id, whatever key it was stored under.
 */
export function parseServeIntents(raw: unknown): ServeIntents {
  if (!raw || typeof raw !== 'object') {
    return {};
  }
  const intents: ServeIntents = {};
  for (const value of Object.values(raw as Record<string, unknown>)) {
    const intent = parseIntent(value);
    if (intent) {
      intents[poolIdOf(intent)] = intent;
    }
  }
  return intents;
}

/** A row of the Serving view that is a served model, not a cached download or a preset nobody serves. */
function isServedRow(model: ServedModel): boolean {
  return model.loaded === true || model.phase !== undefined;
}

/**
 * The served model the intent is about, among the installation's rows: the
 * model served from that preset on the kserve backend — the pool's cluster —
 * or the serving object `load_model` composed for it.
 */
export function servedModelOf(
  intent: ServeIntent,
  models: readonly ServedModel[],
): ServedModel | undefined {
  const resource =
    intent.outcome?.kind === 'served' ? intent.outcome.resource : undefined;
  return models.find(
    model =>
      model.installation === intent.installation &&
      model.backend === SERVE_INTENT_BACKEND &&
      isServedRow(model) &&
      (model.preset === intent.preset ||
        (resource !== undefined && model.name === resource)),
  );
}

/** Whether a served model answers: model-manager's phase, or the row's readiness where there is none. */
export function isServedModelReady(
  model: Pick<ServedModel, 'phase' | 'readiness'>,
): boolean {
  return model.phase ? model.phase === 'ready' : model.readiness === 'ready';
}

/** The refusal `check_fit` answered, as the outcome keeps it: the reason verbatim, the sizes under it. */
export function refusedOutcome(
  fit: ModelManagerFitResult,
  now: string = new Date().toISOString(),
): ServeIntentOutcome {
  const verdict = describeFitVerdict(fit);
  return {
    kind: 'refused',
    reason: verdict.summary,
    details: verdict.details,
    at: now,
  };
}

/**
 * The intents whose pool is gone for good: their installation's pools were
 * read (settled, without error), the pool is not among them, and the choice
 * is older than {@link SERVE_INTENT_STALE_MS} — so a pool Deploy just applied,
 * not yet listed, is never pruned. Remove clears an intent directly; this
 * catches a pool removed outside the portal, so a later pool of the same name
 * does not inherit the choice.
 */
export function staleServeIntentIds(
  intents: ServeIntents,
  listed: {
    rowIds: ReadonlySet<string>;
    settledInstallations: readonly string[];
  },
  now: number = Date.now(),
  staleMs: number = SERVE_INTENT_STALE_MS,
): string[] {
  return Object.entries(intents)
    .filter(
      ([id, intent]) =>
        !listed.rowIds.has(id) &&
        listed.settledInstallations.includes(intent.installation) &&
        now - Date.parse(intent.chosenAt) > staleMs,
    )
    .map(([id]) => id);
}

export type ServeIntentStepInput = {
  intent: ServeIntent;
  /** Every step of the pool's own lifecycle is done: the stack takes the load. */
  stackReady: boolean;
  /** `check_fit` → `load_model` is in flight in this session. */
  loading: boolean;
  /** The served model of the intent, while model-manager lists it. */
  model: ServedModel | undefined;
  /** The Serve dialog on the pool without a preset — the way out of a refusal, the next model after a served one. */
  serveAnotherHref?: string;
  /** The Serve dialog on the pool with the preset preselected — the way out of a failed load. */
  serveInDialogHref?: string;
};

/**
 * The pool lifecycle panel's last step once Deploy carried a preset:
 * **Serving <preset>** — pending until the pool's steps are done, in progress
 * while model-manager is asked and while the served model is on its way (its
 * own timeline as the step's sub-steps, `lib/modelLifecycle`), done once the
 * model answers (and kept done after it was stopped), failed with
 * `check_fit`'s reason verbatim when the preset fits no size of the pool as
 * deployed, or with what `load_model` threw.
 */
export function serveIntentStep(input: ServeIntentStepInput): LifecycleStep {
  const {
    intent,
    stackReady,
    loading,
    model,
    serveAnotherHref,
    serveInDialogHref,
  } = input;
  const id = 'serve';
  const title = `Serving ${serveChoiceLabel(intent)}`;
  const serveAnother = serveAnotherHref
    ? { label: 'Serve another model', to: serveAnotherHref }
    : undefined;
  const serveInDialog = serveInDialogHref
    ? {
        label: `Serve ${serveChoiceLabel(intent)} in the dialog`,
        to: serveInDialogHref,
      }
    : undefined;
  const outcome = intent.outcome;

  if (model) {
    const steps = modelLifecycleSteps(model);
    const since = outcome?.at ?? steps[0]?.since;
    if (isServedModelReady(model)) {
      const endpoint = model.externalUrl ?? model.internalUrl;
      return {
        id,
        title,
        state: 'done',
        since,
        finishedAt:
          steps.find(step => step.id === 'ready')?.finishedAt ??
          (outcome?.kind === 'served' ? outcome.ready : undefined),
        message: endpoint
          ? `${model.name} answers at ${endpoint}`
          : `${model.name} is ready`,
        steps,
        action: serveAnother,
      };
    }
    if (model.phase === 'failed') {
      return {
        id,
        title,
        state: 'failed',
        since,
        message: `${model.name}: ${modelPhaseLabel(model) ?? 'failed'}`,
        steps,
        action: serveAnother,
      };
    }
    const phase = modelPhaseLabel(model);
    return {
      id,
      title,
      state: 'inProgress',
      since,
      message: phase ? `${model.name} · ${phase}` : model.name,
      steps,
    };
  }

  switch (outcome?.kind) {
    case 'refused':
      return {
        id,
        title,
        state: 'failed',
        since: outcome.at,
        message: [`Cannot be served on this pool: ${outcome.reason}`]
          .concat(outcome.details)
          .join(' · '),
        action: serveAnother,
      };
    case 'failed':
      return {
        id,
        title,
        state: 'failed',
        since: outcome.at,
        message: `model-manager refused: ${outcome.message}`,
        action: serveInDialog,
      };
    case 'served':
      if (outcome.ready) {
        return {
          id,
          title,
          state: 'done',
          since: outcome.at,
          finishedAt: outcome.ready,
          message: `${outcome.resource} was served, then stopped — model-manager no longer lists it`,
          action: serveAnother,
        };
      }
      return {
        id,
        title,
        state: 'inProgress',
        since: outcome.at,
        message: `model-manager composed ${outcome.resource} as you — the first inventory read follows in a moment`,
      };
    default:
      break;
  }

  if (loading) {
    return {
      id,
      title,
      state: 'inProgress',
      message: `asking model-manager as you: check_fit, then load_model {backend: ${SERVE_INTENT_BACKEND}, model: ${intent.preset}}`,
    };
  }
  if (stackReady) {
    return {
      id,
      title,
      state: 'inProgress',
      message: 'the serving stack is ready — starting',
    };
  }
  return {
    id,
    title,
    state: 'pending',
    message: `once the steps above are done — ${describeServeChoice(intent)} is served through model-manager as you`,
  };
}
