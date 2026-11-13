import {
  egressRemedyKind,
  isDefinedOutsideAgentManager,
  remedyNeedsAgent,
  unknownAgentRemedy,
  type EgressRemedyFacts,
} from './egressRemedy';

const helmRelease = {
  name: 'otter',
  namespace: 'team',
  ready: true,
  suspended: false,
  gitOpsOwned: false,
  deleting: false,
};

const editable: EgressRemedyFacts = {
  scheme: 'https',
  runtime: 'kagent',
  agent: { namespace: 'team', managed: 'helmrelease', helmRelease },
  toolchains: false,
  canCommit: false,
  mayUpdate: true,
};

describe('egressRemedyKind', () => {
  it('waits for the runtime', () => {
    expect(egressRemedyKind({ ...editable, runtime: undefined })).toBe(
      'pending',
    );
  });

  it('promises nothing for a runtime that cannot be known', () => {
    expect(egressRemedyKind({ ...editable, runtime: null })).toBe('neutral');
  });

  it('offers toolchains on a coding Harness where sessions mount them', () => {
    expect(
      egressRemedyKind({ ...editable, runtime: 'claude', toolchains: true }),
    ).toBe('toolchains');
  });

  it('sends a coding Harness without toolchains to the platform team', () => {
    expect(
      egressRemedyKind({ ...editable, runtime: 'codex', toolchains: false }),
    ).toBe('platform');
  });

  it('waits for get_info on a coding Harness', () => {
    expect(
      egressRemedyKind({ ...editable, runtime: 'byo', toolchains: undefined }),
    ).toBe('pending');
  });

  it('needs no agent-manager reading for a coding Harness', () => {
    expect(
      egressRemedyKind({
        ...editable,
        runtime: 'claude',
        agent: null,
        mayUpdate: false,
      }),
    ).toBe('platform');
  });

  it('takes the coding Harness first, for one defined in Git too', () => {
    expect(
      egressRemedyKind({
        ...editable,
        runtime: 'claude',
        agent: {
          namespace: 'kagent',
          managed: 'gitops',
          helmRelease: { ...helmRelease, namespace: 'flux-giantswarm' },
        },
      }),
    ).toBe('platform');
  });

  it('waits for the agent and promises nothing where it cannot be read', () => {
    expect(egressRemedyKind({ ...editable, agent: undefined })).toBe('pending');
    expect(egressRemedyKind({ ...editable, agent: null })).toBe('neutral');
    expect(
      egressRemedyKind({
        ...editable,
        agent: { namespace: 'team', managed: 'none' },
      }),
    ).toBe('neutral');
  });

  it('offers no edit for the platform’s own agent', () => {
    expect(
      egressRemedyKind({
        ...editable,
        canCommit: true,
        agent: { namespace: 'kagent', managed: 'platform' },
      }),
    ).toBe('neutral');
  });

  it('says an agent from Git outside agent-manager’s directory is changed there', () => {
    expect(
      egressRemedyKind({
        ...editable,
        canCommit: true,
        agent: {
          namespace: 'team',
          managed: 'gitops',
          helmRelease: { ...helmRelease, namespace: 'flux-giantswarm' },
        },
      }),
    ).toBe('git');
  });

  it('edits an agent from Git through a pull request where agent-manager commits', () => {
    const gitops: EgressRemedyFacts['agent'] = {
      namespace: 'team',
      managed: 'gitops',
      helmRelease,
    };
    expect(
      egressRemedyKind({ ...editable, agent: gitops, canCommit: true }),
    ).toBe('edit');
    expect(
      egressRemedyKind({ ...editable, agent: gitops, canCommit: false }),
    ).toBe('git');
    expect(
      egressRemedyKind({ ...editable, agent: gitops, canCommit: undefined }),
    ).toBe('pending');
  });

  it('asks an editor for a person who may not update the agent', () => {
    expect(egressRemedyKind({ ...editable, mayUpdate: false })).toBe(
      'ask-editor',
    );
    expect(egressRemedyKind({ ...editable, mayUpdate: undefined })).toBe(
      'pending',
    );
  });

  it('promises nothing where get_info could not be read', () => {
    expect(
      egressRemedyKind({ ...editable, runtime: 'claude', toolchains: null }),
    ).toBe('neutral');
    expect(
      egressRemedyKind({
        ...editable,
        canCommit: null,
        agent: { namespace: 'team', managed: 'gitops', helmRelease },
      }),
    ).toBe('neutral');
    expect(egressRemedyKind({ ...editable, mayUpdate: null })).toBe('neutral');
  });

  it('links the edit page for a person who may', () => {
    expect(egressRemedyKind(editable)).toBe('edit');
    expect(egressRemedyKind({ ...editable, scheme: 'http' })).toBe('edit');
  });

  describe('a raw TCP destination', () => {
    const tcp: EgressRemedyFacts = { ...editable, scheme: 'tcp' };

    it('is allowed by no one on a coding Harness, with toolchains or without', () => {
      expect(
        egressRemedyKind({ ...tcp, runtime: 'claude', toolchains: false }),
      ).toBe('tcp');
      expect(
        egressRemedyKind({ ...tcp, runtime: 'codex', toolchains: true }),
      ).toBe('tcp');
    });

    it('is allowed by no one for a person who may edit the agent', () => {
      expect(egressRemedyKind(tcp)).toBe('tcp');
      expect(egressRemedyKind({ ...tcp, mayUpdate: false })).toBe('tcp');
    });

    it('needs nothing of an agent that cannot be read, or is still read', () => {
      expect(
        egressRemedyKind({
          ...tcp,
          runtime: null,
          agent: null,
          toolchains: null,
          canCommit: null,
          mayUpdate: null,
        }),
      ).toBe('tcp');
      expect(
        egressRemedyKind({
          ...tcp,
          runtime: undefined,
          agent: undefined,
          toolchains: undefined,
          canCommit: undefined,
          mayUpdate: undefined,
        }),
      ).toBe('tcp');
    });

    it('is any scheme but HTTP(S), so no other label reaches an edit', () => {
      for (const scheme of ['TCP', 'tls', 'udp', '']) {
        expect(egressRemedyKind({ ...editable, scheme })).toBe('tcp');
        expect(
          egressRemedyKind({ ...editable, scheme, runtime: 'claude' }),
        ).toBe('tcp');
      }
    });

    it('comes before an agent defined in Git', () => {
      expect(
        egressRemedyKind({
          ...tcp,
          agent: {
            namespace: 'team',
            managed: 'gitops',
            helmRelease: { ...helmRelease, namespace: 'flux-giantswarm' },
          },
        }),
      ).toBe('tcp');
    });
  });
});

describe('remedyNeedsAgent', () => {
  it('is HTTP(S) only', () => {
    expect(remedyNeedsAgent('https')).toBe(true);
    expect(remedyNeedsAgent('http')).toBe(true);
    expect(remedyNeedsAgent('tcp')).toBe(false);
    expect(remedyNeedsAgent('tls')).toBe(false);
  });
});

describe('unknownAgentRemedy', () => {
  it('gives raw TCP and any other non-HTTP scheme its remedy, and promises nothing for the rest', () => {
    expect(unknownAgentRemedy('tcp')).toEqual({ kind: 'tcp' });
    expect(unknownAgentRemedy('tls')).toEqual({ kind: 'tcp' });
    expect(unknownAgentRemedy('https')).toEqual({ kind: 'neutral' });
  });
});

describe('isDefinedOutsideAgentManager', () => {
  it('is an agent from Git whose HelmRelease is in another namespace', () => {
    expect(
      isDefinedOutsideAgentManager({
        namespace: 'kagent',
        managed: 'gitops',
        helmRelease: { ...helmRelease, namespace: 'flux-giantswarm' },
      }),
    ).toBe(true);
    expect(
      isDefinedOutsideAgentManager({
        namespace: 'team',
        managed: 'gitops',
        helmRelease,
      }),
    ).toBe(false);
    expect(
      isDefinedOutsideAgentManager({
        namespace: 'kagent',
        managed: 'helmrelease',
        helmRelease: { ...helmRelease, namespace: 'flux-giantswarm' },
      }),
    ).toBe(false);
  });
});
