import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderInTestApp } from '@backstage/test-utils';
import { MCPServer } from '../../../lib/k8s';
import { GitOpsEditDialog } from './GitOpsEditDialog';

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
  await renderInTestApp(
    <GitOpsEditDialog server={server} isOpen onOpenChange={jest.fn()} />,
  );
  return screen.findByRole('dialog');
}

describe('GitOpsEditDialog', () => {
  beforeEach(() => {
    mockUseGitOpsSource.mockReset();
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
      'find the YAML document that declares kind: MCPServer with name: github in namespace agent-platform',
    );
    expect(dialog).toHaveTextContent(
      'To remove, delete that document; if the file is then empty, delete it too, along with its entry under resources: in the kustomization.yaml next to it, if there is one.',
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

  // The Kustomization is known, but no link could be built — here because the
  // lookup of it failed; an unconfigured host or a non-Git source is the same.
  it('still walks through the steps when the source cannot be linked', async () => {
    mockUseGitOpsSource.mockReturnValue({
      inGit: true,
      isLoading: false,
      errorMessage: 'Kustomization flux-giantswarm/flux-extras is forbidden',
      errors: [],
      kustomization: { name: 'flux-extras', namespace: 'flux-giantswarm' },
    });

    const dialog = await openDialog(makeServer(KUSTOMIZE_LABELS));

    expect(dialog).toHaveTextContent(
      'Find the directory Kustomization flux-giantswarm/flux-extras applies, in the Git repository it reconciles from (Kustomization flux-giantswarm/flux-extras is forbidden).',
    );
    expect(dialog).toHaveTextContent(
      'find the YAML document that declares kind: MCPServer with name: github',
    );
    // The host is unknown, so both names are given.
    expect(dialog).toHaveTextContent(
      'Open a pull request (merge request on GitLab).',
    );
    expect(screen.getByText('Current manifest')).toBeInTheDocument();
  });

  it('says "merge request" for a GitLab source it cannot link to', async () => {
    mockUseGitOpsSource.mockReturnValue({
      inGit: true,
      isLoading: false,
      changeRequestTerm: 'merge request',
      errors: [],
      kustomization: KUSTOMIZATION,
    });

    const dialog = await openDialog(makeServer(KUSTOMIZE_LABELS));

    expect(dialog).toHaveTextContent(
      'Open management-clusters/gazelle/extras in the Git repository Kustomization flux-giantswarm/flux-extras reconciles from.',
    );
    expect(dialog).toHaveTextContent('Open a merge request.');
    expect(dialog).not.toHaveTextContent('pull request');
  });

  it('names the managing object by its kind when nothing in Git is found', async () => {
    mockUseGitOpsSource.mockReturnValue({
      inGit: false,
      isLoading: false,
      errors: [],
    });

    const dialog = await openDialog(
      makeServer({ 'kustomize.toolkit.fluxcd.io/name': 'flux-extras' }),
    );

    expect(dialog).toHaveTextContent(
      'It is managed by Kustomization flux-extras, but its source could not be found. Edit or remove its manifest',
    );
    expect(dialog).not.toHaveTextContent('HelmRelease');
    expect(screen.getByText('Current manifest')).toBeInTheDocument();
  });

  // Rendered by a HelmRelease that is not in Git (applied by hand, say), or
  // that the reader cannot read: the manifest is not what they would edit.
  it('points a chart-rendered server without a source at its values', async () => {
    mockUseGitOpsSource.mockReturnValue({
      inGit: false,
      isLoading: false,
      errorMessage:
        'HelmRelease agent-platform/agent-platform-mcps is forbidden',
      errors: [],
    });

    const dialog = await openDialog(
      makeServer({
        'helm.toolkit.fluxcd.io/name': 'agent-platform-mcps',
        'helm.toolkit.fluxcd.io/namespace': 'agent-platform',
      }),
    );

    expect(dialog).toHaveTextContent(
      'It is managed by HelmRelease agent-platform/agent-platform-mcps, but its source could not be found (HelmRelease agent-platform/agent-platform-mcps is forbidden). Change the values that render github',
    );
    expect(dialog).not.toHaveTextContent('Edit or remove its manifest');
    expect(screen.queryByText('Current manifest')).not.toBeInTheDocument();
  });

  it('shows no steps until the source has resolved', async () => {
    mockUseGitOpsSource.mockReturnValue({
      inGit: false,
      isLoading: true,
      errors: [],
    });

    const dialog = await openDialog(
      makeServer({
        'helm.toolkit.fluxcd.io/name': 'agent-platform-mcps',
        'helm.toolkit.fluxcd.io/namespace': 'agent-platform',
      }),
    );

    expect(dialog).not.toHaveTextContent('Find where HelmRelease');
    expect(dialog).not.toHaveTextContent('could not be found');
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
