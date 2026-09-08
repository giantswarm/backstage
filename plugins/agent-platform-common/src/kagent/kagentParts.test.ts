import {
  isAgentToolName,
  isFunctionCallPart,
  isInternalToolName,
  MUSTER_PROXY_LABEL,
  readTokenUsage,
  unwrapProxiedCall,
} from './kagentParts';

describe('unwrapProxiedCall', () => {
  it('looks through the wrapper to the tool actually invoked', () => {
    const unwrapped = unwrapProxiedCall({
      id: 'c1',
      name: 'call_tool',
      args: { name: 'x_kubernetes_get', arguments: { namespace: 'kagent' } },
    });

    expect(unwrapped).toEqual({
      id: 'c1',
      name: 'x_kubernetes_get',
      args: { namespace: 'kagent' },
      via: MUSTER_PROXY_LABEL,
    });
  });

  it('unwraps a proxied call that genuinely has no arguments', () => {
    // `{ name }` alone is the wrapper and nothing else, so there is no payload
    // to lose by unwrapping.
    expect(
      unwrapProxiedCall({ name: 'call_tool', args: { name: 'x_core_ping' } }),
    ).toEqual({
      id: undefined,
      name: 'x_core_ping',
      args: undefined,
      via: MUSTER_PROXY_LABEL,
    });
  });

  it('leaves the wrapper untouched when it carries an unexpected key', () => {
    // The promise this test exists for: if muster ever moves the inner payload,
    // showing the real tool name beside a silently-empty `args` would render a
    // row with nothing to expand. Degrading to the wrapper keeps the call whole.
    const call = {
      name: 'call_tool',
      args: { name: 'x_kubernetes_get', input: { namespace: 'kagent' } },
    };

    expect(unwrapProxiedCall(call)).toBe(call);
  });

  it('leaves a call that is not proxied alone', () => {
    const call = { name: 'x_prometheus_execute_query', args: { query: 'up' } };

    expect(unwrapProxiedCall(call)).toBe(call);
  });
});

describe('readTokenUsage', () => {
  it('reads usage written under the kagent_ prefix', () => {
    expect(
      readTokenUsage({
        kagent_usage_metadata: {
          promptTokenCount: 3_854,
          candidatesTokenCount: 211,
          totalTokenCount: 4_065,
        },
      }),
    ).toEqual({ total: 4_065, prompt: 3_854, completion: 211 });
  });

  it('reads usage written under the adk_ prefix', () => {
    // Both prefixes occur on one installation — two gazelle sessions a day apart
    // carried different ones — so reading only one silently zeroes a session.
    expect(
      readTokenUsage({
        adk_usage_metadata: {
          promptTokenCount: 100,
          candidatesTokenCount: 20,
          totalTokenCount: 120,
        },
      }),
    ).toEqual({ total: 120, prompt: 100, completion: 20 });
  });

  it('derives the total when kagent reports none', () => {
    // Real gazelle sessions carry exactly these two fields and no
    // `totalTokenCount`, so summing reported totals gave "Total 0" beside
    // millions of input tokens.
    expect(
      readTokenUsage({
        adk_usage_metadata: {
          promptTokenCount: 1_000,
          candidatesTokenCount: 40,
        },
      }),
    ).toEqual({ total: 1_040, prompt: 1_000, completion: 40 });
  });

  it('prefers a reported total that exceeds the parts', () => {
    // A model billing thinking tokens separately counts them in the total and
    // in neither part, so the reported total is the truer number.
    expect(
      readTokenUsage({
        kagent_usage_metadata: {
          promptTokenCount: 10,
          candidatesTokenCount: 5,
          totalTokenCount: 40,
        },
      }),
    ).toEqual({ total: 40, prompt: 10, completion: 5 });
  });

  it('returns undefined for a bag with no usage at all', () => {
    expect(readTokenUsage({})).toBeUndefined();
    expect(readTokenUsage(undefined)).toBeUndefined();
    expect(
      readTokenUsage({
        kagent_usage_metadata: {
          promptTokenCount: 0,
          candidatesTokenCount: 0,
        },
      }),
    ).toBeUndefined();
  });
});

describe('tool name predicates', () => {
  it('recognises a delegation by its encoded namespace separator', () => {
    expect(isAgentToolName('kagent__NS__sre_agent')).toBe(true);
    expect(isAgentToolName('x_kubernetes_get')).toBe(false);
    expect(isAgentToolName(undefined)).toBe(false);
  });

  it('recognises the ADK plumbing that is never shown as a tool call', () => {
    expect(isInternalToolName('ask_user')).toBe(true);
    expect(isInternalToolName('adk_request_credential')).toBe(true);
    expect(isInternalToolName('x_kubernetes_get')).toBe(false);
    expect(isInternalToolName(undefined)).toBe(false);
  });

  it('recognises a function-call part by its metadata, not its shape', () => {
    expect(
      isFunctionCallPart({
        kind: 'data',
        data: { name: 'x_kubernetes_get' },
        metadata: { adk_type: 'function_call' },
      }),
    ).toBe(true);
    expect(
      isFunctionCallPart({
        kind: 'data',
        data: { name: 'x_kubernetes_get' },
        metadata: { adk_type: 'function_response' },
      }),
    ).toBe(false);
  });
});
