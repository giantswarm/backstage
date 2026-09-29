// The API interfaces a served model answers (model-manager 1.1.0 on:
// `interfaces` on a Ready KServe model, read from its running server) and
// what a client sends to use them: a chip per interface, a request example
// per interface filled with the model's endpoint and the name to send.
import type { ServedModel, ServedModelInterface } from './serving';
import { tryModelIdOf } from './modelManagerServe';

/**
 * The interfaces in the order a row shows them, with the label a person
 * reads — agentgateway's format names are the wire vocabulary, not the
 * page's. `Completions` is OpenAI chat completions (the legacy
 * `/v1/completions` comes with it).
 */
export const INTERFACE_LABELS: ReadonlyArray<{ type: string; label: string }> =
  [
    { type: 'Completions', label: 'Chat completions' },
    { type: 'Responses', label: 'Responses' },
    { type: 'Messages', label: 'Messages' },
    { type: 'AnthropicTokenCount', label: 'count_tokens' },
    { type: 'Embeddings', label: 'Embeddings' },
  ];

/** The label of an interface; an unknown one keeps its wire name. */
export function interfaceLabel(type: string): string {
  return INTERFACE_LABELS.find(entry => entry.type === type)?.label ?? type;
}

/** The interfaces in the row's fixed order, unknown ones last in theirs. */
export function sortInterfaces(
  interfaces: ServedModelInterface[],
): ServedModelInterface[] {
  const rank = (type: string) => {
    const i = INTERFACE_LABELS.findIndex(entry => entry.type === type);
    return i < 0 ? INTERFACE_LABELS.length : i;
  };
  return [...interfaces].sort((a, b) => rank(a.type) - rank(b.type));
}

/** The name a client sends as `model`: the public name on the LLM endpoint, else what the ModelConfig sends. */
export function requestModelOf(
  row: Pick<ServedModel, 'name' | 'modelSource' | 'modelConfig' | 'publicName'>,
): string {
  return row.publicName ?? tryModelIdOf(row);
}

/**
 * How a request to the endpoint authenticates: an `https` endpoint checks a
 * bearer — an API key of the LLM endpoint for a model on it, the person's
 * Dex token on the models Gateway —; an in-cluster `http` address checks
 * none.
 */
export function requestAuthOf(
  row: Pick<ServedModel, 'publicName'>,
  endpoint: string,
): { header?: string; note: string } {
  if (!endpoint.startsWith('https://')) {
    return {
      note: 'In-cluster address: no key; send it from a pod of the cluster.',
    };
  }
  if (row.publicName) {
    return {
      header: 'Authorization: Bearer $LLM_API_KEY',
      note: 'LLM_API_KEY is an API key of the LLM endpoint.',
    };
  }
  return {
    header: 'Authorization: Bearer $TOKEN',
    note: 'TOKEN is your Dex ID token; the models Gateway admits a person’s token only.',
  };
}

const PROMPT = 'Say hello in five words.';

/** The request body per interface, the smallest that works. */
function bodyOf(type: string, model: string): object | undefined {
  const messages = [{ role: 'user', content: PROMPT }];
  switch (type) {
    case 'Completions':
      return { model, messages, max_tokens: 64 };
    case 'Responses':
      return { model, input: PROMPT, max_output_tokens: 64 };
    case 'Messages':
      return { model, max_tokens: 64, messages };
    case 'AnthropicTokenCount':
      return { model, messages };
    case 'Embeddings':
      return { model, input: PROMPT };
    default:
      return undefined;
  }
}

/** One copy-able request against an interface. */
export type RequestExample = {
  type: string;
  label: string;
  url: string;
  command: string;
};

/**
 * One `curl` per interface the model reports, in the row's order, filled with
 * its endpoint, the name to send and the auth the endpoint checks — so the
 * first request works without reading docs. Anthropic's interfaces carry
 * `anthropic-version`. An interface without a known body gets no example.
 */
export function requestExamples(
  row: Pick<
    ServedModel,
    'name' | 'modelSource' | 'modelConfig' | 'publicName' | 'interfaces'
  >,
  endpoint: string,
): RequestExample[] {
  const model = requestModelOf(row);
  const auth = requestAuthOf(row, endpoint);
  const base = endpoint.replace(/\/+$/, '');
  return sortInterfaces(row.interfaces ?? []).flatMap(api => {
    const body = bodyOf(api.type, model);
    if (!body) {
      return [];
    }
    const url = `${base}${api.path}`;
    const headers = ['Content-Type: application/json'];
    if (auth.header) {
      headers.push(auth.header);
    }
    if (api.type === 'Messages' || api.type === 'AnthropicTokenCount') {
      headers.push('anthropic-version: 2023-06-01');
    }
    const command = [
      `curl -sS ${url}`,
      ...headers.map(header => `  -H "${header}"`),
      `  -d '${JSON.stringify(body)}'`,
    ].join(' \\\n');
    return [{ type: api.type, label: interfaceLabel(api.type), url, command }];
  });
}
