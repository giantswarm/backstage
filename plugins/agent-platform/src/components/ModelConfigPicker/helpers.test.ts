import type { AgentManagerModelConfig } from '../../lib/agentManager';
import {
  isReportedDefault,
  preselectedModelConfig,
  tenantModelConfigs,
  unresolvedReason,
} from './helpers';

function model(
  namespace: string,
  name: string,
  readiness: 'accepted' | 'notAccepted' | 'pending' = 'accepted',
) {
  return {
    getName: () => name,
    getNamespace: () => namespace,
    getDisplayName: () => name,
    getModel: () => 'claude',
    getProvider: () => 'Anthropic',
    getReadiness: () => readiness,
    getReadinessMessage: () =>
      readiness === 'notAccepted' ? 'Secret kagent-x not found' : undefined,
  };
}

function reported(
  namespace: string,
  name: string,
  fields: Partial<AgentManagerModelConfig> = {},
): AgentManagerModelConfig {
  return { name, namespace, accepted: true, resolvedRefs: true, ...fields };
}

describe('preselectedModelConfig', () => {
  it('picks the model agent-manager reports as the default', () => {
    const sonnet = model('kagent', 'sonnet');

    expect(
      preselectedModelConfig(
        [model('kagent', 'haiku'), sonnet],
        [
          reported('kagent', 'haiku'),
          reported('kagent', 'sonnet', { default: true }),
        ],
      ),
    ).toBe(sonnet);
  });

  it('picks nothing without a default, even for the only model', () => {
    expect(
      preselectedModelConfig(
        [model('kagent', 'sonnet')],
        [reported('kagent', 'sonnet')],
      ),
    ).toBeUndefined();
  });

  it('picks nothing by name: default-model-config is not special here', () => {
    expect(
      preselectedModelConfig(
        [model('kagent', 'default-model-config'), model('kagent', 'opus')],
        [],
      ),
    ).toBeUndefined();
  });

  it('picks nothing when the default is not among the choices', () => {
    expect(
      preselectedModelConfig(
        [model('org-acme', 'sonnet')],
        [reported('kagent', 'sonnet', { default: true })],
      ),
    ).toBeUndefined();
  });
});

describe('isReportedDefault', () => {
  it('matches name and namespace', () => {
    const list = [reported('kagent', 'sonnet', { default: true })];

    expect(isReportedDefault(model('kagent', 'sonnet'), list)).toBe(true);
    expect(isReportedDefault(model('org-acme', 'sonnet'), list)).toBe(false);
  });
});

describe('unresolvedReason', () => {
  it("reads agent-manager's ResolvedRefs when it reported the model", () => {
    expect(
      unresolvedReason(model('kagent', 'sonnet', 'notAccepted'), [
        reported('kagent', 'sonnet', { resolvedRefs: false }),
      ]),
    ).toEqual({ message: 'Secret kagent-x not found' });
    expect(
      unresolvedReason(model('kagent', 'sonnet', 'notAccepted'), [
        reported('kagent', 'sonnet', { resolvedRefs: true }),
      ]),
    ).toBeUndefined();
  });

  it("falls back to the controller's verdict without an answer", () => {
    expect(
      unresolvedReason(model('kagent', 'sonnet', 'notAccepted'), []),
    ).toEqual({ message: 'Secret kagent-x not found' });
    expect(
      unresolvedReason(model('kagent', 'sonnet', 'pending'), []),
    ).toBeUndefined();
  });
});

describe('tenantModelConfigs', () => {
  const where = (choices: { getName(): string; getNamespace(): string }[]) =>
    choices.map(mc => `${mc.getNamespace()}/${mc.getName()}`);

  it("offers a tenant only its own models, the platform's not copied in", () => {
    expect(
      where(
        tenantModelConfigs(
          [model('kagent', 'sonnet'), model('org-acme', 'own-key')],
          'org-acme',
        ),
      ),
    ).toEqual(['org-acme/own-key']);
  });

  it('offers every model without a tenant', () => {
    expect(
      where(
        tenantModelConfigs(
          [model('kagent', 'sonnet'), model('org-acme', 'own-key')],
          undefined,
        ),
      ),
    ).toEqual(['kagent/sonnet', 'org-acme/own-key']);
  });
});
