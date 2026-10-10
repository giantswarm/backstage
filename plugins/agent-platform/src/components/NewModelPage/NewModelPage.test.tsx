import { renderInTestApp } from '@backstage/frontend-test-utils';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PageHeaderActionsProvider } from '@giantswarm/backstage-plugin-ui-react';

import { modelsRouteRef } from '../../routes';
import { NewModelPage } from './NewModelPage';

jest.mock('@giantswarm/backstage-plugin-gs', () => ({
  ALL_INSTALLATIONS: 'all',
  useInstallations: () => ({
    installations: [{ name: 'golem' }],
    isLoading: false,
  }),
  useInstallationInventory: () => ({
    installationsWith: () => ['golem'],
    isLoading: false,
    isProbing: false,
  }),
  useInstallationScope: () => ({ scope: 'all' }),
}));

jest.mock('../../hooks/useSaveModelConfig', () => ({
  useSaveModelConfig: () => ({
    save: jest.fn(),
    isSaving: false,
    error: undefined,
    reset: jest.fn(),
  }),
}));

let mockServingInstallations: string[] | undefined;
jest.mock('../ServingProvider', () => ({
  hasServingLayer: (serving: { installations: string[] }) =>
    serving.installations.length > 0,
  useOptionalServing: () =>
    mockServingInstallations
      ? {
          installations: mockServingInstallations,
          unreachableInstallations: [],
        }
      : undefined,
}));

function renderPage() {
  return renderInTestApp(
    <PageHeaderActionsProvider>
      <NewModelPage />
    </PageHeaderActionsProvider>,
    { mountedRoutes: { '/agent-platform/models': modelsRouteRef } },
  );
}

beforeEach(() => {
  mockServingInstallations = undefined;
});

describe('NewModelPage', () => {
  it('asks for the display name first and fills the technical name from it', async () => {
    await renderPage();

    const displayName = screen.getByLabelText(/^Display name/);
    const technicalName = screen.getByLabelText(/^Technical name/);
    expect(
      displayName.compareDocumentPosition(technicalName) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();

    await userEvent.type(displayName, 'Sonnet 4.5');
    expect(technicalName).toHaveValue('sonnet-4-5');
  });

  it('stops filling the technical name once the person types one', async () => {
    await renderPage();

    const technicalName = screen.getByLabelText(/^Technical name/);
    await userEvent.type(technicalName, 'my-model');
    await userEvent.type(screen.getByLabelText(/^Display name/), 'Sonnet');
    expect(technicalName).toHaveValue('my-model');
  });

  it('marks each missing field itself on a blocked submit and focuses the first', async () => {
    await renderPage();

    const technicalName = screen.getByLabelText(/^Technical name/);
    const model = screen.getByRole('textbox', { name: /^Model/ });
    expect(technicalName).not.toHaveAttribute('aria-invalid');

    await userEvent.click(screen.getByRole('button', { name: 'Add model' }));

    expect(technicalName).toHaveAttribute('aria-invalid', 'true');
    expect(technicalName).toHaveAccessibleDescription(
      expect.stringContaining('Technical name is required'),
    );
    expect(technicalName).toHaveFocus();
    expect(model).toHaveAttribute('aria-invalid', 'true');
    expect(model).toHaveAccessibleDescription(
      expect.stringContaining('Model is required'),
    );
    const apiKey = screen.getByLabelText(/^API key/);
    expect(apiKey).toHaveAttribute('aria-invalid', 'true');
    expect(apiKey).toHaveAccessibleDescription(
      expect.stringContaining('API key is required'),
    );
    expect(
      screen.queryByText(/Please fix the following/),
    ).not.toBeInTheDocument();

    // A fixed field drops its error while the others keep theirs.
    await userEvent.type(technicalName, 'sonnet');
    expect(technicalName).not.toHaveAttribute('aria-invalid');
    expect(model).toHaveAttribute('aria-invalid', 'true');
  });

  it('introduces itself plainly, pointing at model hosting only where it exists', async () => {
    const { unmount } = await renderPage();
    expect(
      screen.getByText(/^Agents run on the models you add here\./),
    ).toBeInTheDocument();
    expect(screen.queryByText(/ModelConfig/)).not.toBeInTheDocument();
    expect(
      screen.queryByRole('link', { name: 'Model hosting' }),
    ).not.toBeInTheDocument();
    unmount();

    mockServingInstallations = ['golem'];
    await renderPage();
    expect(screen.getByRole('link', { name: 'Model hosting' })).toHaveAttribute(
      'href',
      '/agent-platform/models/serving',
    );
  });
});
