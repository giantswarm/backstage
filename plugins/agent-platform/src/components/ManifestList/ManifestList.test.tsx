import { renderInTestApp } from '@backstage/frontend-test-utils';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ManifestList } from './ManifestList';

const manifests = [
  {
    apiVersion: 'v1',
    kind: 'ConfigMap',
    metadata: { name: 'pool-values', namespace: 'org-acme' },
    data: { replicas: '2' },
  },
  {
    apiVersion: 'helm.toolkit.fluxcd.io/v2',
    kind: 'HelmRelease',
    metadata: { name: 'gpu-pool', namespace: 'org-acme' },
  },
];

describe('ManifestList', () => {
  const createObjectURL = jest.fn();
  let click: jest.SpyInstance;

  beforeEach(() => {
    // jsdom has neither; saving a file needs both.
    URL.createObjectURL = createObjectURL.mockReturnValue('blob:manifest');
    URL.revokeObjectURL = jest.fn();
    click = jest
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => {});
  });

  afterEach(() => {
    click.mockRestore();
    createObjectURL.mockReset();
  });

  it('saves the manifest beside its Download as YAML, under its file name', async () => {
    await renderInTestApp(<ManifestList manifests={manifests} />);

    const downloads = screen.getAllByRole('button', { name: 'Download' });
    expect(downloads).toHaveLength(2);
    await userEvent.click(downloads[1]);

    const blob: Blob = createObjectURL.mock.calls[0][0];
    expect(blob.type).toBe('text/yaml');
    const content = await blob.text();
    expect(content).toContain('kind: HelmRelease');
    expect(content).toContain('name: gpu-pool');
    expect(content).not.toContain('ConfigMap');

    const anchor = click.mock.instances[0] as unknown as HTMLAnchorElement;
    expect(anchor.download).toBe('helmrelease-gpu-pool.yaml');
  });
});
