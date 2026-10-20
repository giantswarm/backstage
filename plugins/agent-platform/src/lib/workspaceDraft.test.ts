import {
  draftFromWorkspace,
  draftProblems,
  emptyDraft,
  emptySource,
  fieldOfManagerMessage,
  managerMessageText,
  nameProblem,
  previewableSources,
  quantityToGiB,
  suggestName,
  toCreateInput,
  toSource,
} from './workspaceDraft';
import type { Workspace } from './workspaceManager';

describe('toSource', () => {
  it('leaves out every empty field', () => {
    expect(
      toSource({
        ...emptySource('github'),
        owner: ' acme ',
        repositories: ['a'],
      }),
    ).toEqual({ provider: 'github', owner: 'acme', repositories: ['a'] });
  });

  it('carries filters, exclusions, archived and forks', () => {
    expect(
      toSource({
        ...emptySource('github'),
        owner: 'acme',
        languages: ['Go'],
        topics: ['mcp'],
        topicMatch: 'all',
        exclude: ['old'],
        includeArchived: true,
        includeForks: true,
      }),
    ).toEqual({
      provider: 'github',
      owner: 'acme',
      filters: { languages: ['Go'], topics: { match: 'all', names: ['mcp'] } },
      exclude: ['old'],
      includeArchived: true,
      includeForks: true,
    });
  });
});

describe('draftFromWorkspace', () => {
  it('round-trips a stored workspace without its sync schedule', () => {
    const workspace: Workspace = {
      name: 'w',
      organization: 'acme',
      sources: [
        {
          provider: 'github',
          owner: 'acme',
          filters: { topics: { names: ['mcp'] } },
          exclude: ['x'],
        },
      ],
      sync: { schedule: 'nightly' },
      sizing: { minimum: '20Gi' },
      resourceVersion: '1',
      createdAt: '',
      repositories: 0,
      sessions: 0,
    };
    const draft = draftFromWorkspace(workspace);
    expect(draft.sources[0].topicMatch).toBe('any');
    expect(toCreateInput(draft, 'acme')).toEqual({
      name: 'w',
      organization: 'acme',
      sources: [
        {
          provider: 'github',
          owner: 'acme',
          filters: { topics: { match: 'any', names: ['mcp'] } },
          exclude: ['x'],
        },
      ],
      sizing: { minimum: '20Gi' },
    });
  });
});

describe('draftProblems', () => {
  it('names the field of each problem', () => {
    const draft = { ...emptyDraft(), name: 'Bad_Name', minimumGiB: '2.5' };
    expect(draftProblems(draft, false)).toEqual({
      name: 'Use lowercase letters, digits and dashes only. Try “bad-name”.',
      'sources.0.provider': 'Choose a provider',
      'sources.0.owner': 'Owner is required',
      'sources.0': 'Pick repositories by name, or filter by language or topic',
      'sizing.minimum': 'Enter a whole number of GiB, such as 20',
    });
  });

  it('does not check the name of an edited workspace', () => {
    const draft = {
      ...emptyDraft('github'),
      sources: [{ ...emptySource('github'), owner: 'acme', languages: ['Go'] }],
    };
    expect(draftProblems(draft, true)).toEqual({});
  });
});

describe('nameProblem', () => {
  it.each([
    ['platform-mcp', undefined],
    ['', 'Name is required'],
    [
      'Platform MCP',
      'Use lowercase letters, digits and dashes only. Try “platform-mcp”.',
    ],
    ['a'.repeat(41), `Use at most 40 characters. Try “${'a'.repeat(40)}”.`],
    ['---', 'Use lowercase letters, digits and dashes only.'],
  ])('%s → %s', (typed, problem) => {
    expect(nameProblem(typed)).toBe(problem);
  });

  it('suggests no dash at either end', () => {
    expect(suggestName(' -My_Workspace!- ')).toBe('my-workspace');
  });
});

describe('the minimum size in GiB', () => {
  it.each([
    ['20Gi', '20'],
    ['500Mi', '1'],
    ['1Ti', '1024'],
    ['', ''],
    ['lots', ''],
  ])('reads %s as %s GiB', (quantity, gib) => {
    expect(quantityToGiB(quantity)).toBe(gib);
  });

  it('keeps a stored room to work the form does not edit', () => {
    const draft = {
      ...emptyDraft('github'),
      sources: [{ ...emptySource('github'), owner: 'acme', languages: ['Go'] }],
      minimumGiB: '0',
      headroom: '8Gi',
    };
    expect(toCreateInput(draft, 'acme').sizing).toEqual({ headroom: '8Gi' });
  });
});

describe('previewableSources', () => {
  it('previews only the sources with an owner and a selector', () => {
    const draft = {
      ...emptyDraft(),
      sources: [
        { ...emptySource('github'), owner: 'acme', languages: ['Go'] },
        { ...emptySource('github'), owner: 'acme' },
        { ...emptySource('github'), repositories: ['x'] },
      ],
    };
    expect(previewableSources(draft)).toEqual([
      { provider: 'github', owner: 'acme', filters: { languages: ['Go'] } },
    ]);
  });
});

describe('fieldOfManagerMessage', () => {
  it.each([
    [
      'create_workspace: invalid workspace: Workspace.workspace-manager.giantswarm.io "w" is invalid: spec.sources[1].owner: Invalid value: "": owner in body should be at least 1 chars long',
      'sources.1.owner',
    ],
    [
      'create_workspace: invalid workspace: invalid workspace "w": sources[0]: unknown provider instance "gh" (configured: github)',
      'sources.0.provider',
    ],
    [
      'update_workspace: invalid workspace: spec.sources[0]: Invalid value: "object": a source needs at least one selector: repositories, filters.languages or filters.topics',
      'sources.0',
    ],
    [
      'update_workspace: invalid workspace: spec.sources[2].filters.topics.names: Too many: 65',
      'sources.2.topics',
    ],
    [
      'create_workspace: invalid workspace: invalid workspace: sizing.minimum "lots": quantities must match the regular expression',
      'sizing.minimum',
    ],
    [
      'update_workspace: invalid workspace: sizing.headroom "lots": quantities must match the regular expression',
      undefined,
    ],
    [
      'create_workspace: invalid workspace: Workspace.workspace-manager.giantswarm.io "W" is invalid: metadata.name: Invalid value: "W": a lowercase RFC 1123 subdomain must consist of',
      'name',
    ],
    ['create_workspace: invalid workspace: something else', undefined],
  ])('%s → %s', (message, field) => {
    expect(fieldOfManagerMessage(message)).toBe(field);
  });

  it('strips the operation from the message shown', () => {
    expect(
      managerMessageText('create_workspace: invalid workspace: spec.x: bad'),
    ).toBe('spec.x: bad');
  });
});
