import { renderInTestApp } from '@backstage/frontend-test-utils';
import { EntityProvider } from '@backstage/plugin-catalog-react';
import type { Entity } from '@backstage/catalog-model';
import { screen } from '@testing-library/react';
import { EntityInstallationDetailsCard } from './EntityInstallationDetailsCard';

describe('<EntityInstallationDetailsCard />', () => {
  it("links the access docs' footnote reference to its note", async () => {
    const entity: Entity = {
      apiVersion: 'backstage.io/v1alpha1',
      kind: 'Resource',
      metadata: {
        name: 'golem',
        annotations: {
          'giantswarm.io/access-docs-markdown':
            'Use the jump host[^1].\n\n[^1]: Reachable over the VPN.',
        },
      },
    };
    const { container } = await renderInTestApp(
      <EntityProvider entity={entity}>
        <EntityInstallationDetailsCard />
      </EntityProvider>,
    );

    const reference = screen.getByRole('link', { name: '1' });
    const note = screen.getByText('Reachable over the VPN.').closest('li');
    expect(note).toHaveAttribute('id', 'user-content-fn-1');
    expect(reference.getAttribute('href')?.split('#')[1]).toBe(note!.id);
    expect(
      container.querySelector('[id^="user-content-user-content-"]'),
    ).toBeNull();
  });
});
