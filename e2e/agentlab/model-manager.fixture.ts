import type { Page, Route } from '@playwright/test';

/**
 * model-manager at the browser: the answers of `x_model-manager_<tool>` calls
 * the portal makes over muster's `/call` route, stubbed per tool for what the
 * lab lacks (a kserve backend a GPU pool registered, its presets, a fit
 * verdict, a served model on its way). The portal reaches model-manager
 * through muster only, so stubbing the tool calls is stubbing model-manager;
 * every tool not named here, and every other server's tool, falls through to
 * the next handler and then to the lab.
 *
 * Also here: the one-shot drop of the plugin's persisted query cache, which
 * every spec that stages a serving layer needs (below).
 */

export type ToolCall = { name: string; arguments: Record<string, unknown> };

/**
 * A tool the stub refuses: answered in the wire shape of a refused tool —
 * muster-backend's error body, a structured block as gs-node's
 * `MusterToolError` `details` — so the portal's error handling runs for real.
 */
export class ToolRefusal {
  constructor(
    readonly message: string,
    readonly details: string[] = [],
  ) {}
}

/** A stubbed tool's answer: a value, a refusal, or computed from the call's arguments. */
export type ToolAnswer =
  | Record<string, unknown>
  | ToolRefusal
  | ((args: Record<string, unknown>, call: ToolCall) => unknown);

export type ModelManagerStub = {
  /** Every model-manager tool call the page made, in order. */
  calls: ToolCall[];
  /** The calls of one tool, by its model-manager name (`check_fit`). */
  callsOf: (tool: string) => ToolCall[];
  /** Stop answering; the lab's own model-manager is reached again. */
  unroute: () => Promise<void>;
};

const TOOL_PREFIX = 'x_model-manager_';
const CALL_ROUTE = '**/api/muster/call**';

/**
 * Answer the named model-manager tools at the browser. Registered after other
 * `/call` stubs (cluster-manager's) it runs first and hands every call that is
 * not one of these tools on with `fallback()`, so both stubs coexist on one
 * page and the lab's servers answer everything else.
 */
export async function stubModelManagerTools(
  page: Page,
  answers: Record<string, ToolAnswer>,
): Promise<ModelManagerStub> {
  const calls: ToolCall[] = [];
  const handler = async (route: Route) => {
    const body = route.request().postDataJSON() as ToolCall | undefined;
    const tool = body?.name?.startsWith(TOOL_PREFIX)
      ? body.name.slice(TOOL_PREFIX.length)
      : undefined;
    if (!body || !tool || !(tool in answers)) {
      await route.fallback();
      return;
    }
    const call = { name: body.name, arguments: body.arguments ?? {} };
    calls.push(call);
    const answer = answers[tool];
    const json =
      typeof answer === 'function'
        ? await answer(call.arguments, call)
        : answer;
    if (json instanceof ToolRefusal) {
      await route.fulfill({
        status: 500,
        json: {
          error: {
            name: 'MusterToolError',
            message: json.message,
            details: json.details,
          },
        },
      });
      return;
    }
    await route.fulfill({ json });
  };
  await page.route(CALL_ROUTE, handler);
  return {
    calls,
    callsOf: tool =>
      calls.filter(call => call.name === `${TOOL_PREFIX}${tool}`),
    unroute: () => page.unroute(CALL_ROUTE, handler),
  };
}

/**
 * The plugin persists its react-query cache in localStorage
 * (`AGENT_PLATFORM_PERSISTER_KEY` in its `QueryClientProvider`) and reads the
 * backends at most once a minute, so a page load within that minute takes the
 * lab's real backends from the cache and never asks the stub — the staged
 * model then renders in the wrong backend's vocabulary. A one-shot init
 * script drops the persisted cache on the next navigation, before the app
 * runs: armed for the staged page load, and again afterwards so the staged
 * answer does not outlive the test. Writes to that cache are throttled, so
 * clearing it from the running page would race a pending write.
 */
export const PERSISTER_KEY = 'agent-platform-react-query-cache';
const DROP_FLAG = 'e2e-drop-persisted-queries';

/** Install the init script once per page; `dropPersistedQueriesOnNextLoad` then arms it. */
export async function installPersistedQueryDrop(page: Page): Promise<void> {
  await page.addInitScript(
    ([key, flag]) => {
      if (window.sessionStorage.getItem(flag)) {
        window.sessionStorage.removeItem(flag);
        window.localStorage.removeItem(key);
      }
    },
    [PERSISTER_KEY, DROP_FLAG] as const,
  );
}

/** The next navigation starts without the plugin's persisted query cache. */
export async function dropPersistedQueriesOnNextLoad(
  page: Page,
): Promise<void> {
  await page.evaluate(
    flag => window.sessionStorage.setItem(flag, '1'),
    DROP_FLAG,
  );
}

/** The kserve backend a GPU node pool registers with model-manager, as `list_backends` lists it. */
export const KSERVE_POOL_BACKEND = {
  backend: 'kserve',
  source: 'cluster-manager',
  endpoint: 'https://kubernetes.default.svc',
  healthy: true,
  capabilities: {
    pull: false,
    pullProgress: false,
    delete: false,
    load: true,
    unload: true,
    loadedModels: true,
    wire: true,
    presets: true,
    fitCheck: true,
    nodeInventory: false,
    search: false,
  },
  loading: { onDemand: false, idleEviction: false },
  wiring: { namespace: 'kagent', apiVersion: 'v1alpha3', autoWire: true },
};

/** The presets model-manager publishes for a cluster with an L4 pool, as `list_presets` answers. */
export const L4_POOL_PRESETS = [
  {
    name: 'qwen3-4b-instruct',
    displayName: 'Qwen3 4B Instruct',
    description: 'Chat and tools, 32k context',
    model: 'Qwen/Qwen3-4B-Instruct-2507',
    format: 'vLLM',
    contextLength: 32768,
    gpus: 1,
    weightsBytes: 8_060_000_000,
  },
  {
    name: 'qwen3-8b-fp8',
    displayName: 'Qwen3 8B FP8',
    model: 'Qwen/Qwen3-8B-FP8',
    format: 'vLLM',
    contextLength: 32768,
    gpus: 1,
    weightsBytes: 9_000_000_000,
  },
];

export const NO_SIZE =
  'no size of the pool hosts qwen3-8b-fp8: needs 21.1 GB, the largest size g6.xlarge has 24 GB of which 22 GB are usable';

/** `check_fit` on the pool: the 4B preset fits and its weights are in the claim; the 8B one fits no size. */
export const POOL_FIT: Record<string, Record<string, unknown>> = {
  'qwen3-4b-instruct': {
    model: 'qwen3-4b-instruct',
    backend: 'kserve',
    fits: true,
    instanceType: 'g6.xlarge',
    budgetSource: 'pool-scale-from-zero',
    cached: true,
    cacheSource: 'index',
    weightsBytes: 8_060_000_000,
    overheadBytes: 4_000_000_000,
    requiredBytes: 12_060_000_000,
  },
  'qwen3-8b-fp8': {
    model: 'qwen3-8b-fp8',
    backend: 'kserve',
    fits: false,
    reason: NO_SIZE,
    budgetSource: 'pool-scale-from-zero',
    cached: false,
    cacheSource: 'unknown',
    requiredBytes: 21_100_000_000,
  },
};

/** `check_fit` answered from {@link POOL_FIT} by the preset asked about. */
export const poolFitAnswer = (
  args: Record<string, unknown>,
): Record<string, unknown> => {
  const model = String(args.model ?? '');
  return POOL_FIT[model] ?? { model, fits: false };
};
