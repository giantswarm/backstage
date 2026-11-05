import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Workspace } from '../../lib/workspaceManager';
import type { AgentRow } from '../AgentsDataProvider';
import { WorkspacePicker } from './WorkspacePicker';

let mockWorkspaces: Workspace[] = [];
jest.mock('../../hooks/useSessionWorkspaces', () => ({
  useSessionWorkspaces: () => ({
    workspaces: mockWorkspaces,
    isLoading: false,
  }),
  useLastWorkspace: () => ({
    lastWorkspaceOf: () => undefined,
    rememberWorkspace: jest.fn(),
  }),
}));

const agent = {
  id: 'gazelle/kagent/sre',
  installation: 'gazelle',
} as AgentRow;

const workspace = (name: string) =>
  ({ name, organization: 'acme', repositories: 1 }) as Workspace;

async function openPicker(count: number) {
  mockWorkspaces = Array.from({ length: count }, (_, i) =>
    workspace(`ws-${i + 1}`),
  );
  render(
    <WorkspacePicker agent={agent} value={undefined} onChange={jest.fn()} />,
  );
  await userEvent.click(screen.getByRole('button', { name: /Workspace/ }));
  await screen.findByRole('option', { name: /No workspace/ });
}

describe('WorkspacePicker', () => {
  it('offers no search over one workspace and "No workspace"', async () => {
    await openPicker(1);
    expect(screen.queryByRole('searchbox')).toBeNull();
  });

  it('offers a search over two workspaces and "No workspace"', async () => {
    await openPicker(2);
    expect(
      screen.getByRole('searchbox', { name: /Search 2 workspaces/ }),
    ).toBeInTheDocument();
  });
});
