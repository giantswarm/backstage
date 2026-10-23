import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import type { AddSourceResult } from '../../lib/toolchainManager';
import { AddToolchainSourceDialog } from './AddToolchainSourceDialog';

const mockAdd = {
  mutate: jest.fn(),
  reset: jest.fn(),
  isPending: false,
  error: null as Error | null,
  data: undefined as AddSourceResult | undefined,
};
jest.mock('../../hooks/useToolchainWrites', () => ({
  useAddToolchainSource: () => mockAdd,
}));
jest.mock('../ToolchainGrantPrompt', () => ({
  ToolchainGrantPrompt: () => <p>Grant the App</p>,
}));

function renderDialog() {
  return render(
    <AddToolchainSourceDialog
      installation="gazelle"
      isOpen
      onOpenChange={jest.fn()}
    />,
  );
}

beforeEach(() => {
  mockAdd.mutate.mockReset();
  mockAdd.data = undefined;
  mockAdd.error = null;
});

describe('AddToolchainSourceDialog', () => {
  it('adds the repository with its registry and Slack channel, trimmed', async () => {
    renderDialog();

    await userEvent.type(
      screen.getByRole('textbox', { name: /Repository/ }),
      ' https://github.com/acme/toolchains/ ',
    );
    await userEvent.type(
      screen.getByRole('textbox', { name: /Registry/ }),
      'registry.example.com/acme',
    );
    await userEvent.type(
      screen.getByRole('textbox', { name: /Slack channel/ }),
      '#team-toolchains',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Add source' }));

    expect(mockAdd.mutate).toHaveBeenCalledWith({
      repository: 'https://github.com/acme/toolchains',
      registry: 'registry.example.com/acme',
      slackChannel: '#team-toolchains',
    });
  });

  it('shows every error on submit and adds nothing', async () => {
    renderDialog();

    await userEvent.click(screen.getByRole('button', { name: 'Add source' }));

    expect(mockAdd.mutate).not.toHaveBeenCalled();
    expect(
      screen.getByText(
        'Enter the repository as owner/name, e.g. my-org/toolchains',
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Enter the Slack channel, e.g. #team-toolchains'),
    ).toBeInTheDocument();
  });

  it('says the source waits for an owner once added', () => {
    mockAdd.data = {
      source: {
        name: 'acme',
        repository: 'acme/toolchains',
        url: 'https://github.com/acme/toolchains',
        registry: 'registry.example.com/acme',
        origin: 'added',
        phase: 'Pending',
        offered: false,
      },
      message: 'added',
    };
    renderDialog();

    expect(screen.getByText('acme/toolchains added')).toBeInTheDocument();
    expect(
      screen.getByText(/once an owner of the installation approves it/),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Done' })).toBeInTheDocument();
  });

  it("links the App's installation when it does not reach the repository", () => {
    mockAdd.data = {
      status: 'install_required',
      installURL: 'https://github.com/apps/toolchain-manager/installations/new',
      message: 'The App is not installed on acme/toolchains.',
    };
    renderDialog();

    expect(
      screen.getByRole('link', { name: 'Install the App' }),
    ).toHaveAttribute(
      'href',
      'https://github.com/apps/toolchain-manager/installations/new',
    );
  });
});
