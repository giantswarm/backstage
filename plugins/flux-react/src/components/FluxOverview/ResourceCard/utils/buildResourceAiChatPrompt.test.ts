import {
  HelmRelease,
  Kustomization,
} from '@giantswarm/backstage-plugin-kubernetes-react';
import { buildResourceAiChatPrompt } from './buildResourceAiChatPrompt';

const UPGRADE_ERROR =
  'Helm upgrade failed for release agent-platform/muster-runbooks: cannot patch "failing-pods" with kind Workflow';
const ROLLBACK_MESSAGE =
  'Helm rollback to previous release agent-platform/muster-runbooks.v53 succeeded';

function createFailedUpgrade(): HelmRelease {
  const json = {
    apiVersion: 'helm.toolkit.fluxcd.io/v2',
    kind: 'HelmRelease',
    metadata: { name: 'muster-runbooks', namespace: 'flux-giantswarm' },
    spec: {},
    status: {
      lastAttemptedRevision: '0.2.15+800a0275a0f0',
      conditions: [
        {
          type: 'Ready',
          status: 'False',
          reason: 'RollbackSucceeded',
          message: ROLLBACK_MESSAGE,
          lastTransitionTime: '2026-07-30T09:26:44Z',
        },
        {
          type: 'Released',
          status: 'False',
          reason: 'UpgradeFailed',
          message: UPGRADE_ERROR,
          lastTransitionTime: '2026-07-30T09:25:31Z',
        },
        {
          type: 'Remediated',
          status: 'True',
          reason: 'RollbackSucceeded',
          message: ROLLBACK_MESSAGE,
          lastTransitionTime: '2026-07-30T09:26:44Z',
        },
      ],
    },
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return new HelmRelease(json as any, 'test-installation');
}

function createKustomization(readyStatus: 'True' | 'False'): Kustomization {
  const json = {
    apiVersion: 'kustomize.toolkit.fluxcd.io/v1',
    kind: 'Kustomization',
    metadata: { name: 'my-app', namespace: 'flux-system' },
    spec: {},
    status: {
      conditions: [
        {
          type: 'Ready',
          status: readyStatus,
          reason: 'BuildFailed',
          message: 'kustomize build failed: accumulating resources',
          lastTransitionTime: '2026-07-30T09:26:44Z',
        },
      ],
    },
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return new Kustomization(json as any, 'test-installation');
}

describe('buildResourceAiChatPrompt', () => {
  it('explains the release failure rather than the rollback that masks it', () => {
    const { message, troubleshoot } = buildResourceAiChatPrompt({
      kind: 'HelmRelease',
      name: 'muster-runbooks',
      namespace: 'flux-giantswarm',
      cluster: 'test-installation',
      resource: createFailedUpgrade(),
      readyStatus: 'False',
    });

    expect(message).toContain(UPGRADE_ERROR);
    expect(message).not.toContain(ROLLBACK_MESSAGE);
    expect(message).toContain("reason 'UpgradeFailed'");
    expect(message).toContain("revision '0.2.15+800a0275a0f0'");
    expect(troubleshoot).toBe(true);
  });

  it('troubleshoots a stalled release that never reports Ready as False', () => {
    // Observed live: helm-controller stopped retrying and left the
    // "reconciliation in progress" Ready condition behind, so keying the prompt
    // on a False Ready status would ask for basic details on a failed release.
    const json = {
      apiVersion: 'helm.toolkit.fluxcd.io/v2',
      kind: 'HelmRelease',
      metadata: { name: 'hello-world', namespace: 'org-giantswarm' },
      spec: {},
      status: {
        lastAttemptedRevision: '3.0.2+306e35548098',
        conditions: [
          {
            type: 'Stalled',
            status: 'True',
            reason: 'RetriesExceeded',
            message: 'Failed to upgrade after 1 attempt(s)',
            lastTransitionTime: '2026-07-30T11:33:09Z',
          },
          {
            type: 'Ready',
            status: 'Unknown',
            reason: 'Progressing',
            message: 'reconciliation in progress',
            lastTransitionTime: '2026-07-30T11:33:09Z',
          },
          {
            type: 'Released',
            status: 'False',
            reason: 'UpgradeFailed',
            message: UPGRADE_ERROR,
            lastTransitionTime: '2026-05-28T12:55:44Z',
          },
        ],
      },
    };

    const { message, troubleshoot } = buildResourceAiChatPrompt({
      kind: 'HelmRelease',
      name: 'hello-world',
      namespace: 'org-giantswarm',
      cluster: 'test-installation',
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      resource: new HelmRelease(json as any, 'test-installation'),
      readyStatus: 'Unknown',
    });

    expect(message).toContain(UPGRADE_ERROR);
    expect(message).not.toContain('reconciliation in progress');
    expect(troubleshoot).toBe(true);
  });

  it('explains a failing resource from its Ready condition', () => {
    const { message, troubleshoot } = buildResourceAiChatPrompt({
      kind: 'Kustomization',
      name: 'my-app',
      namespace: 'flux-system',
      cluster: 'test-installation',
      resource: createKustomization('False'),
      readyStatus: 'False',
    });

    expect(message).toContain('kustomize build failed: accumulating resources');
    expect(message).toContain("reason 'BuildFailed'");
    expect(troubleshoot).toBe(true);
  });

  it('asks about the Ready state when there is no message to explain', () => {
    const { message, troubleshoot } = buildResourceAiChatPrompt({
      kind: 'Kustomization',
      name: 'my-app',
      cluster: 'test-installation',
      readyStatus: 'False',
    });

    expect(message).toContain('why it is not in a Ready state');
    expect(troubleshoot).toBe(true);
  });

  it('asks for basic details when the resource is not failing', () => {
    const { message, troubleshoot } = buildResourceAiChatPrompt({
      kind: 'Kustomization',
      name: 'my-app',
      namespace: 'flux-system',
      cluster: 'test-installation',
      resource: createKustomization('True'),
      readyStatus: 'True',
    });

    expect(message).toContain('show me basic details');
    expect(message).not.toContain('kustomize build failed');
    expect(troubleshoot).toBe(false);
  });
});
