import { parseTransportDetection } from './transportDetection';

describe('parseTransportDetection', () => {
  it('parses a full streamable-http verdict', () => {
    expect(
      parseTransportDetection({
        url: 'https://mcp.example.com/mcp',
        transport: 'streamable-http',
        reachable: true,
        requiresAuth: false,
        serverName: 'example',
        serverVersion: '1.2.3',
        detail: 'initialize handshake succeeded over streamable-http',
      }),
    ).toEqual({
      transport: 'streamable-http',
      reachable: true,
      requiresAuth: false,
      serverName: 'example',
      serverVersion: '1.2.3',
      detail: 'initialize handshake succeeded over streamable-http',
    });
  });

  it('parses an sse verdict without server info', () => {
    expect(
      parseTransportDetection({
        transport: 'sse',
        reachable: true,
        requiresAuth: false,
      }),
    ).toMatchObject({ transport: 'sse', reachable: true });
  });

  it('parses an unknown verdict', () => {
    expect(
      parseTransportDetection({ transport: 'unknown', reachable: false }),
    ).toMatchObject({ transport: 'unknown', reachable: false });
  });

  it('carries requiresAuth for 401-challenged servers', () => {
    expect(
      parseTransportDetection({
        transport: 'streamable-http',
        reachable: true,
        requiresAuth: true,
      }),
    ).toMatchObject({ requiresAuth: true });
  });

  it.each([
    ['a string', 'streamable-http'],
    ['null', null],
    ['a number', 42],
    ['an object without transport', { reachable: true }],
    ['an unexpected transport', { transport: 'stdio' }],
  ])('returns undefined for %s', (_label, raw) => {
    expect(parseTransportDetection(raw)).toBeUndefined();
  });

  it('coerces malformed flag fields to false instead of trusting them', () => {
    expect(
      parseTransportDetection({
        transport: 'sse',
        reachable: 'yes',
        requiresAuth: 1,
        serverName: 42,
      }),
    ).toEqual({
      transport: 'sse',
      reachable: false,
      requiresAuth: false,
      serverName: undefined,
      serverVersion: undefined,
      detail: undefined,
    });
  });
});
