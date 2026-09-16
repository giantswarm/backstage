import { ManagerInfo } from '../apis';
import { defaultScope } from './scope';

const info = (groups: string[]): ManagerInfo => ({
  version: 'v0.3.0',
  toolPrefix: 'giantswarm-repo-manager',
  caller: { email: 'someone@example.com', groups },
  github: { apiUrl: '', grant: { obtained: true }, circleciConfigured: false },
  inventory: { connected: true, records: 3 },
});

describe('defaultScope', () => {
  it('opens on My team', () => {
    expect(
      defaultScope(info(['giantswarm-github:giantswarm:team-bumblebee'])),
    ).toBe('mine');
    expect(defaultScope(undefined)).toBe('mine');
  });

  it('opens on Unassigned for a Planeteer', () => {
    expect(
      defaultScope(
        info([
          'giantswarm-github:giantswarm:employees',
          'giantswarm-github:giantswarm:team-planeteers',
        ]),
      ),
    ).toBe('unassigned');
  });
});
