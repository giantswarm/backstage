import { InputError } from '@backstage/errors';

/**
 * "Try it" on a served model: one short chat completion against the model's
 * endpoint as model-manager reports it — twice, without a token and with the
 * signed-in person's — so the person sees the models Gateway enforce the
 * ModelConfig's passthrough (401 without, 200 with) and the model answer.
 *
 * The endpoint is what the person's Models page read from model-manager over
 * muster (`list_models`, `running.endpoint`) and shows next to the button; on
 * a GPU install that is the models Gateway's route (`…/<namespace>/<name>`),
 * and the completion goes to its `/v1/chat/completions`. The portal's backend
 * posts it because the browser cannot reach that host cross-origin; it is
 * held to the installation's own domain ({@link completionsUrl}) so this
 * route posts a person's token nowhere but where that installation serves.
 */

/** Header carrying the person's installation token. Must match SERVED_MODEL_AUTH_HEADER in plugins/agent-platform. */
export const SERVED_MODEL_AUTH_HEADER = 'backstage-served-model-authorization';

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
  /** The served model's completions URL ({@link completionsUrl}). */
  url: string;
  /** The model id the completion is sent for: the serving object's name. */
  model: string;
  /** The person's Dex ID token, sent as `Authorization: Bearer` on the second call. */
  userToken: string;
  fetchFn: typeof fetch;
  timeoutMs?: number;
};

/**
 * The completions URL of a served model's endpoint, held to the installation:
 * `https`, and a host that is the installation's base domain or under it (the
 * models Gateway is `models.<baseDomain>`). Anything else is refused — this
 * backend posts a person's token to no other host — and so is an endpoint
 * for an installation whose base domain the portal does not know.
 */
export function completionsUrl(
  endpoint: string,
  baseDomain: string | undefined,
): string {
  if (!baseDomain) {
    throw new InputError(
      'The installation has no base domain configured, so the portal cannot tell whether the endpoint is its own; nothing was sent.',
    );
  }
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    throw new InputError(`'${endpoint}' is not a URL.`);
  }
  if (url.protocol !== 'https:') {
    throw new InputError(
      `The endpoint must be reached over https; '${url.protocol}' is refused.`,
    );
  }
  const host = url.hostname.toLowerCase();
  const domain = baseDomain.toLowerCase();
  if (host !== domain && !host.endsWith(`.${domain}`)) {
    throw new InputError(
      `'${url.hostname}' is not under the installation's domain; the portal tries served models on the installation's own endpoints only.`,
    );
  }
  url.hash = '';
  url.search = '';
  return `${url.toString().replace(/\/+$/, '')}/v1/chat/completions`;
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
  const anonymous = await postCompletion(
    options.fetchFn,
    options.url,
    options.model,
    undefined,
    timeoutMs,
  );
  const startedAt = Date.now();
  const asPerson = await postCompletion(
    options.fetchFn,
    options.url,
    options.model,
    options.userToken,
    timeoutMs,
  );
  return {
    url: options.url,
    model: options.model,
    without: { status: anonymous.status, error: anonymous.error },
    with: { ...asPerson, latencyMs: Date.now() - startedAt },
  };
}
