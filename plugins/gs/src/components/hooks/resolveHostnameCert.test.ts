import { MimirMetricSample } from '../../apis/mimir/types';
import {
  hostnameMatchesListener,
  resolveHostnameCert,
  ResolveInputs,
} from './resolveHostnameCert';

function sample(
  metric: Record<string, string>,
  value = '1',
): MimirMetricSample {
  return { metric, value: [0, value] };
}

describe('hostnameMatchesListener', () => {
  it('matches an exact pattern', () => {
    expect(hostnameMatchesListener('foo.example.com', 'foo.example.com')).toBe(
      true,
    );
  });

  it('matches a single extra label against a wildcard', () => {
    expect(hostnameMatchesListener('foo.example.com', '*.example.com')).toBe(
      true,
    );
  });

  it('does not match multiple labels against a wildcard', () => {
    expect(hostnameMatchesListener('a.b.example.com', '*.example.com')).toBe(
      false,
    );
  });

  it('does not match the bare suffix against a wildcard', () => {
    expect(hostnameMatchesListener('example.com', '*.example.com')).toBe(false);
  });

  it('never matches an empty pattern', () => {
    expect(hostnameMatchesListener('foo.example.com', undefined)).toBe(false);
    expect(hostnameMatchesListener('foo.example.com', '')).toBe(false);
  });
});

describe('resolveHostnameCert', () => {
  it('resolves a route with no sectionName by matching the listener hostname', () => {
    // Mirrors the `backstage` route: parentRef has no section, so
    // `parent_section_name` is empty and the listener must be found by
    // hostname match against the Gateway's listeners.
    const inputs: ResolveInputs = {
      hostnameSamples: [
        sample({
          hostname: 'devportal.giantswarm.io',
          namespace: 'backstage',
          name: 'backstage',
        }),
      ],
      parentSamples: [
        sample({
          namespace: 'backstage',
          name: 'backstage',
          parent_name: 'giantswarm-default',
          parent_namespace: 'envoy-gateway-system',
          parent_section_name: '',
        }),
      ],
      listenerSamples: [
        sample({
          name: 'giantswarm-default',
          namespace: 'envoy-gateway-system',
          listener_name: 'giantswarmio-https',
          hostname: '*.giantswarm.io',
        }),
        sample({
          name: 'giantswarm-default',
          namespace: 'envoy-gateway-system',
          listener_name: 'https',
          hostname: '*.gazelle.awsprod.gigantic.io',
        }),
        sample({
          name: 'giantswarm-default',
          namespace: 'envoy-gateway-system',
          listener_name: 'http',
        }),
      ],
      expirationSamples: [
        sample(
          {
            name: 'gateway-giantswarm-default-giantswarmio-https',
            exported_namespace: 'envoy-gateway-system',
            issuer_name: 'letsencrypt-giantswarm-gateway',
            issuer_kind: 'Issuer',
          },
          '1789466925',
        ),
      ],
      readySamples: [
        sample(
          {
            name: 'gateway-giantswarm-default-giantswarmio-https',
            exported_namespace: 'envoy-gateway-system',
            condition: 'True',
          },
          '1',
        ),
      ],
    };

    const result = resolveHostnameCert('devportal.giantswarm.io', inputs);

    expect(result).toEqual({
      certName: 'gateway-giantswarm-default-giantswarmio-https',
      namespace: 'envoy-gateway-system',
      hostnamePattern: '*.giantswarm.io',
      ready: 'True',
      expirationSeconds: 1789466925,
      issuerName: 'letsencrypt-giantswarm-gateway',
      issuerKind: 'Issuer',
    });
  });

  it('honors an explicit sectionName and skips non-matching listeners', () => {
    // Mirrors the `schema-server` route: it pins two sections; only the one
    // whose listener hostname matches the queried hostname should resolve.
    const inputs: ResolveInputs = {
      hostnameSamples: [
        sample({
          hostname: 'schema.giantswarm.io',
          namespace: 'schema-server',
          name: 'schema-server',
        }),
      ],
      parentSamples: [
        sample({
          namespace: 'schema-server',
          name: 'schema-server',
          parent_name: 'giantswarm-default',
          parent_namespace: 'envoy-gateway-system',
          parent_section_name: 'giantswarmio-https',
        }),
        sample({
          namespace: 'schema-server',
          name: 'schema-server',
          parent_name: 'giantswarm-default',
          parent_namespace: 'envoy-gateway-system',
          parent_section_name: 'https',
        }),
      ],
      listenerSamples: [
        sample({
          name: 'giantswarm-default',
          namespace: 'envoy-gateway-system',
          listener_name: 'giantswarmio-https',
          hostname: '*.giantswarm.io',
        }),
        sample({
          name: 'giantswarm-default',
          namespace: 'envoy-gateway-system',
          listener_name: 'https',
          hostname: '*.operations.awsprod.gigantic.io',
        }),
      ],
      expirationSamples: [
        sample(
          {
            name: 'gateway-giantswarm-default-giantswarmio-https',
            exported_namespace: 'envoy-gateway-system',
          },
          '1789137370',
        ),
      ],
      readySamples: [],
    };

    const result = resolveHostnameCert('schema.giantswarm.io', inputs);

    expect(result?.certName).toBe(
      'gateway-giantswarm-default-giantswarmio-https',
    );
    expect(result?.hostnamePattern).toBe('*.giantswarm.io');
  });

  it('returns undefined when no listener certificate is found', () => {
    const inputs: ResolveInputs = {
      hostnameSamples: [
        sample({ hostname: 'foo.example.com', namespace: 'ns', name: 'r' }),
      ],
      parentSamples: [
        sample({
          namespace: 'ns',
          name: 'r',
          parent_name: 'gw',
          parent_namespace: 'gw-ns',
          parent_section_name: '',
        }),
      ],
      listenerSamples: [
        sample({
          name: 'gw',
          namespace: 'gw-ns',
          listener_name: 'https',
          hostname: '*.example.com',
        }),
      ],
      expirationSamples: [],
      readySamples: [],
    };

    expect(resolveHostnameCert('foo.example.com', inputs)).toBeUndefined();
  });
});
