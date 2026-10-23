import {
  egressRemedyKind,
  isDefinedOutsideAgentManager,
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

  it('links the edit page for a person who may', () => {
    expect(egressRemedyKind(editable)).toBe('edit');
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
