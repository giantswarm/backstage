import { screen } from '@testing-library/react';
import { renderInTestApp } from '@backstage/frontend-test-utils';
import {
  ErrorInfoUnion,
  SecretStore,
} from '@giantswarm/backstage-plugin-kubernetes-react';
import { SecretStorePicker } from './SecretStorePicker';

const INSTALLATION = 'my-installation';

let mockResources: SecretStore[] = [];
let mockErrors: ErrorInfoUnion[] = [];

jest.mock('@giantswarm/backstage-plugin-kubernetes-react', () => ({
  ...jest.requireActual('@giantswarm/backstage-plugin-kubernetes-react'),
  useResources: () => ({
    resources: mockResources,
    isLoading: false,
    errors: mockErrors,
  }),
}));

function makeSecretStore(name: string) {
  return new SecretStore(
    {
      apiVersion: 'external-secrets.io/v1',
      kind: 'SecretStore',
      metadata: { name, namespace: 'org-team' },
    } as any,
    INSTALLATION,
  );
}

async function renderPicker({
  schema = {},
  isClusterSecretStore = false,
}: {
  schema?: Record<string, unknown>;
  isClusterSecretStore?: boolean;
} = {}) {
  await renderInTestApp(
    <SecretStorePicker
      {...({
        onChange: jest.fn(),
        rawErrors: [],
        required: true,
        formData: undefined,
        schema,
        uiSchema: {
          'ui:options': {
            installationName: INSTALLATION,
            clusterNamespace: 'org-team',
            isClusterSecretStore,
          },
        },
        idSchema: { $id: 'store' },
        formContext: { formData: {} },
      } as any)}
    />,
  );
}

describe('SecretStorePicker', () => {
  beforeEach(() => {
    mockResources = [makeSecretStore('vault')];
    mockErrors = [];
  });

  it('labels the field by scope when the template sets no title', async () => {
    await renderPicker({ isClusterSecretStore: false });

    expect(screen.getByText('Secret store')).toBeInTheDocument();
    expect(screen.getByText('Secret store reference.')).toBeInTheDocument();
  });

  it("uses the template's title and description", async () => {
    await renderPicker({
      schema: { title: 'Credentials store', description: 'Where they go.' },
    });

    expect(screen.getByText('Credentials store')).toBeInTheDocument();
    expect(screen.getByText('Where they go.')).toBeInTheDocument();
    expect(screen.queryByText('Cluster secret store')).not.toBeInTheDocument();
  });

  it('explains an API version the cluster does not serve', async () => {
    mockResources = [];
    mockErrors = [
      {
        type: 'incompatibility',
        cluster: INSTALLATION,
        incompatibility: {
          resourceClass: 'SecretStore',
          cluster: INSTALLATION,
          clientVersions: ['v1'],
          serverVersions: ['v1beta1'],
        },
      },
    ];

    await renderPicker();

    expect(
      screen.getByText(/Client supports: \[v1\], server provides: \[v1beta1\]/),
    ).toBeInTheDocument();
    expect(screen.queryByText(/object Object/)).not.toBeInTheDocument();
  });

  it('explains a failed list', async () => {
    mockResources = [];
    const error = new Error('forbidden');
    error.name = 'ForbiddenError';
    mockErrors = [{ cluster: INSTALLATION, error, retry: jest.fn() }];

    await renderPicker({ isClusterSecretStore: true });

    expect(
      screen.getByText(
        'Could not read the cluster secret stores: Access forbidden.',
      ),
    ).toBeInTheDocument();
  });
});
