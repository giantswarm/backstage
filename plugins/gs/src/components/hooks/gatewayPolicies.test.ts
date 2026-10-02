import { MimirMetricSample } from '../../apis/mimir/types';
import {
  EnvoyGatewayBackendTrafficPolicyInfo,
  EnvoyGatewaySecurityPolicyInfo,
  EnvoyGatewaySecurityPolicyStatusAncestorAccepted,
  EnvoyGatewaySecurityPolicyTargetInfo,
} from '../../apis/mimir/metrics';
import {
  GatewayPoliciesInputs,
  buildGatewayPolicies,
  isPolicyBroken,
  isPolicyUnattached,
} from './gatewayPolicies';

function sample(
  metric: string,
  labels: Record<string, string>,
  value: string = '1',
): MimirMetricSample {
  return { metric: { __name__: metric, ...labels }, value: [0, value] };
}

const auth = { namespace: 'team-a', name: 'auth' };
const route = {
  target_group: 'gateway.networking.k8s.io',
  target_kind: 'HTTPRoute',
  target_name: 'shop',
};
const ancestor = {
  ancestor_kind: 'Gateway',
  ancestor_namespace: 'envoy-gateway-system',
  ancestor_name: 'giantswarm-default',
  ancestor_section_name: 'https',
};

function inputs(
  overrides: Partial<GatewayPoliciesInputs> = {},
): GatewayPoliciesInputs {
  return {
    info: [sample(EnvoyGatewaySecurityPolicyInfo.name, auth)],
    targetInfo: [],
    ancestorAccepted: [],
    ...overrides,
  };
}

describe('buildGatewayPolicies', () => {
  it('joins targets and ancestor conditions per policy', () => {
    const [policy] = buildGatewayPolicies(
      inputs({
        targetInfo: [
          sample(EnvoyGatewaySecurityPolicyTargetInfo.name, {
            ...auth,
            ...route,
          }),
        ],
        ancestorAccepted: [
          sample(EnvoyGatewaySecurityPolicyStatusAncestorAccepted.name, {
            ...auth,
            ...ancestor,
            reason: 'Accepted',
          }),
        ],
      }),
    );

    expect(policy).toMatchObject({
      id: 'SecurityPolicy/team-a/auth',
      kind: 'SecurityPolicy',
      targets: [{ kind: 'HTTPRoute', name: 'shop', source: 'targetRefs' }],
      ancestors: [
        {
          name: 'giantswarm-default',
          namespace: 'envoy-gateway-system',
          sectionName: 'https',
          accepted: { status: 'true', reason: 'Accepted' },
        },
      ],
    });
    expect(isPolicyBroken(policy)).toBe(false);
    expect(isPolicyUnattached(policy)).toBe(false);
  });

  it('reads the deprecated targetRef from the info metric', () => {
    const [policy] = buildGatewayPolicies(
      inputs({
        info: [
          sample(EnvoyGatewaySecurityPolicyInfo.name, {
            ...auth,
            target_kind: 'Gateway',
            target_name: 'giantswarm-default',
          }),
        ],
      }),
    );
    expect(policy.targets).toEqual([
      { kind: 'Gateway', name: 'giantswarm-default', source: 'targetRef' },
    ]);
  });

  it('keeps the worst condition when an ancestor reports twice', () => {
    const [policy] = buildGatewayPolicies(
      inputs({
        ancestorAccepted: [
          sample(
            EnvoyGatewaySecurityPolicyStatusAncestorAccepted.name,
            { ...auth, ...ancestor, reason: 'Accepted' },
            '1',
          ),
          sample(
            EnvoyGatewaySecurityPolicyStatusAncestorAccepted.name,
            { ...auth, ...ancestor, reason: 'Invalid' },
            '0',
          ),
        ],
      }),
    );
    expect(policy.ancestors[0].accepted).toEqual({
      status: 'false',
      reason: 'Invalid',
    });
    expect(isPolicyBroken(policy)).toBe(true);
  });

  it('keeps a Gateway and a ListenerSet ancestor with the same name apart', () => {
    const [policy] = buildGatewayPolicies(
      inputs({
        ancestorAccepted: [
          sample(EnvoyGatewaySecurityPolicyStatusAncestorAccepted.name, {
            ...auth,
            ...ancestor,
          }),
          sample(EnvoyGatewaySecurityPolicyStatusAncestorAccepted.name, {
            ...auth,
            ...ancestor,
            ancestor_group: 'gateway.networking.k8s.io',
            ancestor_kind: 'ListenerSet',
          }),
        ],
      }),
    );
    expect(policy.ancestors.map(a => a.kind).sort()).toEqual([
      'Gateway',
      'ListenerSet',
    ]);
  });

  it('flags a policy without status as unattached when the cluster exports policy status', () => {
    const dangling = { namespace: 'team-a', name: 'dangling' };
    const policies = buildGatewayPolicies(
      inputs({
        info: [
          sample(EnvoyGatewaySecurityPolicyInfo.name, auth),
          sample(EnvoyGatewaySecurityPolicyInfo.name, dangling),
        ],
        targetInfo: [
          sample(EnvoyGatewaySecurityPolicyTargetInfo.name, {
            ...dangling,
            ...route,
            target_name: 'does-not-exist',
          }),
        ],
        ancestorAccepted: [
          sample(EnvoyGatewaySecurityPolicyStatusAncestorAccepted.name, {
            ...auth,
            ...ancestor,
          }),
        ],
      }),
    );
    const policy = policies.find(p => p.name === 'dangling')!;
    expect(policy.status).toEqual({ status: 'not-reported' });
    expect(isPolicyUnattached(policy)).toBe(true);
  });

  it('reports status as not available on a cluster without the policy status metrics', () => {
    const [policy] = buildGatewayPolicies(
      inputs({ targetInfo: [], ancestorAccepted: [] }),
    );
    expect(policy.status).toEqual({ status: 'not-available' });
    expect(isPolicyUnattached(policy)).toBe(false);
  });

  it('reports status as not available when the status query failed', () => {
    const [policy] = buildGatewayPolicies(
      inputs({
        targetInfo: [
          sample(EnvoyGatewaySecurityPolicyTargetInfo.name, {
            ...auth,
            ...route,
          }),
        ],
        ancestorAccepted: undefined,
      }),
    );
    expect(policy.status).toEqual({ status: 'not-available' });
  });

  it('keeps policies of different kinds with the same name apart', () => {
    const policies = buildGatewayPolicies(
      inputs({
        info: [
          sample(EnvoyGatewaySecurityPolicyInfo.name, auth),
          sample(EnvoyGatewayBackendTrafficPolicyInfo.name, auth),
          sample('some_unrelated_metric', auth),
        ],
      }),
    );
    expect(policies.map(p => p.kind)).toEqual([
      'BackendTrafficPolicy',
      'SecurityPolicy',
    ]);
  });
});
