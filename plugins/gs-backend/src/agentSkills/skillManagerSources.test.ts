import { mockServices } from '@backstage/backend-test-utils';
import {
  requireWritableSource,
  skillSourcesReader,
  type SkillSource,
} from './skillManagerSources';

const mockCallTool = jest.fn();
jest.mock('@giantswarm/backstage-plugin-gs-node', () => ({
  ...jest.requireActual('@giantswarm/backstage-plugin-gs-node'),
  MusterMcpClient: jest.fn().mockImplementation(() => ({
    callTool: mockCallTool,
  })),
}));

function reader() {
  return skillSourcesReader(
    mockServices.rootConfig({
      data: {
        muster: {
          installations: [{ name: 'graveler', url: 'https://muster.example' }],
        },
      },
    }),
    mockServices.logger.mock(),
  );
}

describe('skillSourcesReader', () => {
  beforeEach(() => mockCallTool.mockReset());

  it('reads list_skill_sources as the person', async () => {
    mockCallTool.mockResolvedValue({
      sources: [{ url: 'https://github.com/acme/skills' }],
    });
    await expect(reader()('graveler', 'muster-token')).resolves.toEqual([
      { url: 'https://github.com/acme/skills' },
    ]);
    expect(mockCallTool).toHaveBeenCalledWith(
      'x_skill-manager_list_skill_sources',
      {},
      { authToken: 'muster-token' },
    );
  });

  it('refuses an answer without sources', async () => {
    mockCallTool.mockResolvedValue('upstream unavailable');
    await expect(reader()('graveler', 'muster-token')).rejects.toThrow(
      /without sources/,
    );
  });

  it('refuses an installation the portal has no muster for', async () => {
    await expect(reader()('elsewhere', 'muster-token')).rejects.toThrow(
      /not one of the portal's muster installations/,
    );
    expect(mockCallTool).not.toHaveBeenCalled();
  });
});

const sources: SkillSource[] = [
  {
    url: 'https://github.com/giantswarm/agent-platform',
    ref: 'v4.180.0',
    path: 'skills',
    readOnly: true,
  },
  { url: 'https://github.com/giantswarm/agent-skills' },
  { url: 'https://github.com/acme/team-skills', path: 'skills' },
  { url: 'https://github.com/acme/private', error: 'you cannot read it' },
];

describe('requireWritableSource', () => {
  it('accepts a writable source, compared by its canonical URL', () => {
    expect(() =>
      requireWritableSource(sources, {
        repoUrl: 'https://github.com/GiantSwarm/agent-skills.git/',
        kind: 'create',
        skillName: 'notes',
      }),
    ).not.toThrow();
  });

  it('refuses a repository that is no source', () => {
    expect(() =>
      requireWritableSource(sources, {
        repoUrl: 'https://github.com/acme/elsewhere',
        kind: 'create',
        skillName: 'notes',
      }),
    ).toThrow(/not one of the installation's skill sources/);
  });

  it('refuses a read-only source', () => {
    expect(() =>
      requireWritableSource(sources, {
        repoUrl: 'https://github.com/giantswarm/agent-platform',
        kind: 'update',
        skillName: 'x',
        path: 'skills/x',
      }),
    ).toThrow(/read-only/);
  });

  it('refuses a source the person cannot read', () => {
    expect(() =>
      requireWritableSource(sources, {
        repoUrl: 'https://github.com/acme/private',
        kind: 'create',
        skillName: 'notes',
      }),
    ).toThrow(/you cannot read it/);
  });

  it('keeps an update below the source path', () => {
    expect(() =>
      requireWritableSource(sources, {
        repoUrl: 'https://github.com/acme/team-skills',
        kind: 'update',
        skillName: 'x',
        path: 'skills/x',
      }),
    ).not.toThrow();
    expect(() =>
      requireWritableSource(sources, {
        repoUrl: 'https://github.com/acme/team-skills',
        kind: 'update',
        skillName: 'x',
        path: 'other/x',
      }),
    ).toThrow(/below skills/);
  });

  it('refuses a new skill at the root of a source with a path', () => {
    expect(() =>
      requireWritableSource(sources, {
        repoUrl: 'https://github.com/acme/team-skills',
        kind: 'create',
        skillName: 'notes',
      }),
    ).toThrow(/below skills/);
  });
});
