import { screen } from '@testing-library/react';
import { renderInTestApp } from '@backstage/test-utils';
import { Kustomization } from '@giantswarm/backstage-plugin-kubernetes-react';
import { Details } from './Details';

function createKustomization(): Kustomization {
  const json = {
    apiVersion: 'kustomize.toolkit.fluxcd.io/v1',
    kind: 'Kustomization',
    metadata: {
      name: 'my-app',
      namespace: 'flux-system',
    },
    spec: {},
    status: {},
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return new Kustomization(json as any, 'test-installation');
}

const emptyCollections = {
  allKustomizations: [],
  allHelmReleases: [],
  allGitRepositories: [],
  allOCIRepositories: [],
  allHelmRepositories: [],
  allImagePolicies: [],
  allImageRepositories: [],
  allImageUpdateAutomations: [],
};

describe('Details', () => {
  it('shows a loading indicator while resources are loading', async () => {
    await renderInTestApp(
      <Details
        resourceRef={{
          cluster: 'test-installation',
          kind: 'kustomization',
          name: 'my-app',
        }}
        isLoadingResources
        {...emptyCollections}
      />,
    );

    expect(screen.getByTestId('progress')).toBeInTheDocument();
  });

  it('shows a not-found message when the resource is missing', async () => {
    await renderInTestApp(
      <Details
        resourceRef={{
          cluster: 'test-installation',
          kind: 'kustomization',
          name: 'my-app',
          namespace: 'flux-system',
        }}
        isLoadingResources={false}
        {...emptyCollections}
      />,
    );

    expect(screen.getByText(/not found/i)).toBeInTheDocument();
    expect(
      screen.getByText(/No Kustomization resources were found/i),
    ).toBeInTheDocument();
  });

  it('renders the Kustomization details for a Kustomization resource', async () => {
    await renderInTestApp(
      <Details
        resourceRef={{
          cluster: 'test-installation',
          kind: 'kustomization',
          name: 'my-app',
          namespace: 'flux-system',
        }}
        resource={createKustomization()}
        isLoadingResources={false}
        {...emptyCollections}
      />,
    );

    expect(screen.getByText('This Kustomization')).toBeInTheDocument();
    expect(screen.getByText('my-app')).toBeInTheDocument();
  });
});
