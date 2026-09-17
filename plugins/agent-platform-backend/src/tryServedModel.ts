import { NotFoundError } from '@backstage/errors';

/**
 * "Try it" on a served model: one short chat completion against the model's
 * endpoint as model-manager reports it — twice, without a token and with the
 * signed-in person's — so the person sees the models Gateway enforce the
 * ModelConfig's passthrough (401 without, 200 with) and the model answer.
 *
 * The target is never the caller's: it is the `endpoint` of the served model
 * in model-manager's `GET /api/v1/loaded` answer for the installation, read
 * as the person on the same request. On gazelle that is the models Gateway's
 * route (`…/<namespace>/<name>`); the completion goes to its
 * `/v1/chat/completions`.
 */

/** The prompt of a try: short, deterministic, and the answer is one word. */
export const TRY_PROMPT = 'Answer with the single word: pong';

const MAX_TOKENS = 16;
const DEFAULT_TIMEOUT_MS = 30_000;
const ERROR_EXCERPT_LENGTH = 300;

export type TryServedModelResult = {
  /** The URL the completions were posted to. */
  url: string;
  /** The model id sent in the request body (the ModelConfig's `spec.model`). */
  model: string;
  /** The call without a token: what the gateway answers anonymous callers. */
  without: { status: number; error?: string };
  /** The call as the person: the status, the model's answer on 200, the body excerpt otherwise. */
  with: { status: number; content?: string; error?: string; latencyMs: number };
};

export type TryServedModelOptions = {
  /** model-manager's `GET /api/v1/loaded` answer for the installation, read as the person. */
  loaded: unknown;
  /** The served model: its serving object's name (`resource`) or its model name. */
  model: string;
  /** The person's Dex ID token, sent as `Authorization: Bearer` on the second call. */
  userToken: string;
  fetchFn: typeof fetch;
  timeoutMs?: number;
};

type LoadedEntry = { name?: unknown; resource?: unknown; endpoint?: unknown };

/** The served model's completions URL and the model id agents send, from the loaded list. */
export function completionsTarget(
  loaded: unknown,
  model: string,
): { url: string; model: string } {
  const entries = (loaded as { loaded?: unknown } | undefined)?.loaded;
  const entry = (Array.isArray(entries) ? (entries as LoadedEntry[]) : []).find(
    candidate => candidate.resource === model || candidate.name === model,
  );
  if (!entry) {
    throw new NotFoundError(
      `Model '${model}' is not serving on this installation (model-manager does not list it as loaded).`,
    );
  }
  const endpoint = typeof entry.endpoint === 'string' ? entry.endpoint : '';
  if (!/^https?:\/\//.test(endpoint)) {
    throw new NotFoundError(
      `model-manager reports no endpoint for '${model}' yet; it is not ready to be tried.`,
    );
  }
  const id =
    typeof entry.resource === 'string' && entry.resource
      ? entry.resource
      : model;
  return {
    url: `${endpoint.replace(/\/+$/, '')}/v1/chat/completions`,
    model: id,
  };
}

/** Why a call got no HTTP answer: the deadline, or the network's own words. */
function describeFailure(error: unknown, timeoutMs: number): string {
  if (error instanceof Error && error.name === 'AbortError') {
    return `no answer within ${Math.round(timeoutMs / 1000)} s`;
  }
  return error instanceof Error ? error.message : String(error);
}

async function postCompletion(
  fetchFn: typeof fetch,
  url: string,
  model: string,
  token: string | undefined,
  timeoutMs: number,
): Promise<{ status: number; content?: string; error?: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchFn(url, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: TRY_PROMPT }],
        max_tokens: MAX_TOKENS,
        temperature: 0,
      }),
      signal: controller.signal,
    });
    const text = await response.text();
    if (!response.ok) {
      return {
        status: response.status,
        error: text.slice(0, ERROR_EXCERPT_LENGTH) || response.statusText,
      };
    }
    let content: string | undefined;
    try {
      const body = JSON.parse(text) as {
        choices?: { message?: { content?: unknown } }[];
      };
      const answer = body.choices?.[0]?.message?.content;
      content = typeof answer === 'string' ? answer.trim() : undefined;
    } catch {
      content = undefined;
    }
    return { status: response.status, content };
  } catch (error) {
    return { status: 0, error: describeFailure(error, timeoutMs) };
  } finally {
    clearTimeout(timer);
  }
}

export async function tryServedModel(
  options: TryServedModelOptions,
): Promise<TryServedModelResult> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const target = completionsTarget(options.loaded, options.model);
  const anonymous = await postCompletion(
    options.fetchFn,
    target.url,
    target.model,
    undefined,
    timeoutMs,
  );
  const startedAt = Date.now();
  const asPerson = await postCompletion(
    options.fetchFn,
    target.url,
    target.model,
    options.userToken,
    timeoutMs,
  );
  return {
    url: target.url,
    model: target.model,
    without: { status: anonymous.status, error: anonymous.error },
    with: { ...asPerson, latencyMs: Date.now() - startedAt },
  };
}
