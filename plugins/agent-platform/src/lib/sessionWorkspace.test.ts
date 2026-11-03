import { workspaceChipText } from './sessionWorkspace';
import type { Workspace } from './workspaceManager';

const now = new Date('2026-11-03T12:00:00Z');

const docs: Workspace = {
  name: 'ws-docs',
  organization: 'lab',
  sources: [],
  sync: { schedule: 'nightly' },
  resourceVersion: '1',
  createdAt: '2026-10-01T00:00:00Z',
  repositories: 2,
  sessions: 1,
  lastSync: { time: '2026-11-03T08:00:00Z', result: 'Succeeded' },
  volume: { handle: 'fs-1::docs' },
};

describe('workspaceChipText', () => {
  it('labels a named workspace by its name alone, the sync and fetched count going to its details', () => {
    expect(
      workspaceChipText({ status: 'named', workspace: docs }, 1, now),
    ).toEqual({
      label: 'ws-docs',
      details: 'Synchronized 4 h ago · 1 repository fetched',
    });
  });

  it('says a workspace that never synchronized so, and counts the repositories in the plural', () => {
    expect(
      workspaceChipText(
        { status: 'named', workspace: { ...docs, lastSync: undefined } },
        0,
        now,
      ).details,
    ).toBe('Not synchronized yet · 0 repositories fetched');
  });

  it('labels an unnamed workspace "Workspace", with only the fetched count to tell', () => {
    expect(workspaceChipText({ status: 'unnamed' }, 2, now)).toEqual({
      label: 'Workspace',
      details: '2 repositories fetched',
    });
  });
});
