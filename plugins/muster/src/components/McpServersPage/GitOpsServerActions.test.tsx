import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderInTestApp } from '@backstage/test-utils';
import { MCPServer } from '../../lib/k8s';
import { GitOpsServerActions } from './GitOpsServerActions';

const mockUseGitOpsSource = jest.fn();

jest.mock('@giantswarm/backstage-plugin-flux-react', () => ({
  useGitOpsSource: (...args: unknown[]) => mockUseGitOpsSource(...args),
}));

const SOURCE_URL =
  'https://github.com/giantswarm/management-clusters/tree/abc123/management-clusters/gazelle/extras';

const KUSTOMIZATION = {
  name: 'flux-extras',
  namespace: 'flux-giantswarm',
  path: './management-clusters/gazelle/extras',
};

function makeServer(labels: Record<string, string>): MCPServer {
  return new MCPServer(
    {
      apiVersion: 'muster.giantswarm.io/v1alpha1',
      kind: 'MCPServer',
      metadata: { name: 'github', namespace: 'agent-platform', labels },
      spec: {
        type: 'streamable-http',
        url: 'https://api.githubcopilot.com/mcp/',
      },
    } as never,
    'gazelle',
  );
}

const KUSTOMIZE_LABELS = {
  'kustomize.toolkit.fluxcd.io/name': 'flux-extras',
  'kustomize.toolkit.fluxcd.io/namespace': 'flux-giantswarm',
};

async function openDialog(server: MCPServer) {
  await renderInTestApp(<GitOpsServerActions server={server} />);
  await userEvent.click(screen.getByRole('button', { name: 'Edit/Remove' }));
  return screen.findByRole('dialog');
}

describe('GitOpsServerActions', () => {
  beforeEach(() => {
    mockUseGitOpsSource.mockReset();
  });

  it('offers one Edit/Remove action and links the label to the source', async () => {
    mockUseGitOpsSource.mockReturnValue({
      inGit: true,
      isLoading: false,
      url: SOURCE_URL,
      errors: [],
      kustomization: KUSTOMIZATION,
    });

    await renderInTestApp(
      <GitOpsServerActions server={makeServer(KUSTOMIZE_LABELS)} />,
    );

    expect(screen.getByText('Managed through GitOps')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Source/ })).toHaveAttribute(
      'href',
      SOURCE_URL,
    );
    expect(
      screen.getByRole('button', { name: 'Edit/Remove' }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /via GitOps/ }),
    ).not.toBeInTheDocument();
    expect(mockUseGitOpsSource).toHaveBeenCalledWith(
      expect.anything(),
      'gazelle',
    );
  });

  it('keeps the plain label for a server whose source is not in Git', async () => {
    mockUseGitOpsSource.mockReturnValue({
      inGit: false,
      isLoading: false,
      errors: [],
    });

    await renderInTestApp(
      <GitOpsServerActions
        server={makeServer({ 'app.kubernetes.io/managed-by': 'Helm' })}
      />,
    );

    expect(screen.getByText('Managed through GitOps')).toBeInTheDocument();
    expect(
      screen.queryByRole('link', { name: /Source/ }),
    ).not.toBeInTheDocument();
  });

  it('walks through editing or removing the manifest applied by a Kustomization', async () => {
    mockUseGitOpsSource.mockReturnValue({
      inGit: true,
      isLoading: false,
      url: SOURCE_URL,
      changeRequestTerm: 'pull request',
      errors: [],
      kustomization: KUSTOMIZATION,
    });

    const dialog = await openDialog(makeServer(KUSTOMIZE_LABELS));

    expect(dialog).toHaveTextContent('Edit or remove github');
    expect(
      screen.getByRole('link', {
        name: /management-clusters\/gazelle\/extras/,
      }),
    ).toHaveAttribute('href', SOURCE_URL);
    expect(dialog).toHaveTextContent(
      'find the file that declares kind: MCPServer with name: github in namespace agent-platform',
    );
    expect(dialog).toHaveTextContent(
      'delete the file and its entry in the resources: list of the kustomization.yaml',
    );
    expect(dialog).toHaveTextContent(
      'Open a pull request. Once merged, Flux applies it when Kustomization flux-giantswarm/flux-extras next reconciles',
    );
    expect(screen.getByText('Current manifest')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Copy manifest' }),
    ).toBeInTheDocument();
  });

  it('points a chart-rendered server at the HelmRelease values, not a manifest', async () => {
    mockUseGitOpsSource.mockReturnValue({
      inGit: true,
      isLoading: false,
      url: SOURCE_URL,
      errors: [],
      kustomization: KUSTOMIZATION,
      helmRelease: { name: 'agent-platform-mcps', namespace: 'agent-platform' },
    });

    const dialog = await openDialog(
      makeServer({
        'helm.toolkit.fluxcd.io/name': 'agent-platform-mcps',
        'helm.toolkit.fluxcd.io/namespace': 'agent-platform',
      }),
    );

    expect(dialog).toHaveTextContent(
      'Find where HelmRelease agent-platform/agent-platform-mcps and its values',
    );
    expect(dialog).toHaveTextContent(
      'change the values entry that renders github',
    );
    // The rendered manifest is not what they edit, so it is not offered.
    expect(screen.queryByText('Current manifest')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Copy manifest' }),
    ).not.toBeInTheDocument();
  });

  it('names the managing object by its kind when the source cannot be found', async () => {
    mockUseGitOpsSource.mockReturnValue({
      inGit: true,
      isLoading: false,
      errorMessage: 'Kustomization flux-giantswarm/flux-extras is forbidden',
      errors: [],
      kustomization: { name: 'flux-extras', namespace: 'flux-giantswarm' },
    });

    const dialog = await openDialog(makeServer(KUSTOMIZE_LABELS));

    expect(dialog).toHaveTextContent(
      'It is managed by Kustomization flux-giantswarm/flux-extras, but its source could not be found (Kustomization flux-giantswarm/flux-extras is forbidden)',
    );
    expect(dialog).not.toHaveTextContent('HelmRelease');
    // The host is unknown, so both names are given.
    expect(dialog).toHaveTextContent(
      'open a pull request (merge request on GitLab)',
    );
    expect(screen.getByText('Current manifest')).toBeInTheDocument();
  });

  it('says "merge request" for a GitLab source', async () => {
    mockUseGitOpsSource.mockReturnValue({
      inGit: true,
      isLoading: false,
      url: 'https://gitlab.example.com/platform/gitops/-/tree/abc123/clusters/gazelle',
      changeRequestTerm: 'merge request',
      errors: [],
      kustomization: KUSTOMIZATION,
    });

    const dialog = await openDialog(makeServer(KUSTOMIZE_LABELS));

    expect(dialog).toHaveTextContent('Open a merge request.');
    expect(dialog).not.toHaveTextContent('pull request');
  });

  it('copies the manifest', async () => {
    mockUseGitOpsSource.mockReturnValue({
      inGit: true,
      isLoading: false,
      url: SOURCE_URL,
      errors: [],
      kustomization: KUSTOMIZATION,
    });
    const writeText = jest.fn(() => Promise.resolve());
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
    });

    await openDialog(makeServer(KUSTOMIZE_LABELS));
    await userEvent.click(
      screen.getByRole('button', { name: 'Copy manifest' }),
    );

    expect(writeText).toHaveBeenCalledWith(
      expect.stringContaining('kind: MCPServer'),
    );
  });
});
