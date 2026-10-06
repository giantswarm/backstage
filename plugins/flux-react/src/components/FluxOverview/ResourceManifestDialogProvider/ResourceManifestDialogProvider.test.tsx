import { useState } from 'react';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { errorApiRef } from '@backstage/core-plugin-api';
import { TestApiProvider } from '@backstage/test-utils';
import { Kustomization } from '@giantswarm/backstage-plugin-kubernetes-react';
import {
  ResourceManifestDialogProvider,
  useShowResourceManifest,
} from './ResourceManifestDialogProvider';

// A textarea stands in for the CodeMirror editor, so a test can read the
// manifest as the textbox's value. It replaces the module ManifestDialog
// imports, so the real dialog renders around it.
jest.mock(
  '@giantswarm/backstage-plugin-ui-react/src/components/YamlEditorFormField',
  () => ({
    YamlEditorFormField: ({
      value,
      label,
    }: {
      value: string;
      label?: string;
    }) => <textarea aria-label={label} value={value} readOnly />,
  }),
);

function createKustomization(path: string): Kustomization {
  return new Kustomization(
    {
      apiVersion: 'kustomize.toolkit.fluxcd.io/v1',
      kind: 'Kustomization',
      metadata: {
        name: 'my-app',
        namespace: 'flux-system',
        managedFields: [{ manager: 'kustomize-controller' }],
      },
      spec: { path },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any,
    'test-installation',
  );
}

let pollResource: (resource: Kustomization | undefined) => void;

/** Stands in for a card whose resource is polled, and may disappear. */
const Card = () => {
  const [resource, setResource] = useState<Kustomization | undefined>(
    createKustomization('./apps/v1'),
  );
  pollResource = setResource;
  const showManifest = useShowResourceManifest();

  return resource ? (
    <button onClick={() => showManifest(resource)}>View YAML</button>
  ) : null;
};

function renderProvider() {
  render(
    <TestApiProvider
      apis={[[errorApiRef, { post: jest.fn(), error$: jest.fn() }]]}
    >
      <ResourceManifestDialogProvider>
        <Card />
      </ResourceManifestDialogProvider>
    </TestApiProvider>,
  );
}

function getManifest() {
  return (
    screen.getByRole('textbox', { name: 'Manifest' }) as HTMLTextAreaElement
  ).value;
}

describe('ResourceManifestDialogProvider', () => {
  it('opens the manifest of the resource it was handed', async () => {
    renderProvider();

    await userEvent.click(screen.getByRole('button', { name: 'View YAML' }));

    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveTextContent('Kustomization flux-system/my-app');
    expect(dialog).toHaveTextContent('test-installation');
    expect(getManifest()).toContain('kind: Kustomization');
    expect(getManifest()).toContain('path: ./apps/v1');
    expect(getManifest()).not.toContain('managedFields');
  });

  it('keeps the snapshot it opened with when the resource is polled', async () => {
    renderProvider();

    await userEvent.click(screen.getByRole('button', { name: 'View YAML' }));
    act(() => pollResource(createKustomization('./apps/v2')));

    expect(getManifest()).toContain('path: ./apps/v1');
  });

  it('stays open when the card that opened it unmounts', async () => {
    renderProvider();

    await userEvent.click(screen.getByRole('button', { name: 'View YAML' }));
    act(() => pollResource(undefined));

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(getManifest()).toContain('path: ./apps/v1');
  });

  it('closes on Close', async () => {
    renderProvider();

    await userEvent.click(screen.getByRole('button', { name: 'View YAML' }));
    // The header has its own close icon button; this is the one in the footer.
    const closeButton = screen
      .getAllByRole('button', { name: 'Close' })
      .find(button => button.textContent === 'Close')!;
    await userEvent.click(closeButton);

    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    );
  });
});
