import {
  renderInTestApp,
  TestApiProvider,
} from '@backstage/frontend-test-utils';
import { discoveryApiRef, fetchApiRef } from '@backstage/frontend-plugin-api';
import { screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { EpicChip } from './EpicChip';

const epic = {
  owner: 'example-org',
  repo: 'roadmap',
  number: 123,
  url: 'https://github.com/example-org/roadmap/issues/123',
};

// No roadmap board item resolves: the chip falls back to the GitHub issue.
function renderChip(variant: 'badge' | 'link') {
  return renderInTestApp(
    <TestApiProvider
      apis={[
        [discoveryApiRef, { getBaseUrl: async () => 'http://backend/roadmap' }],
        [fetchApiRef, { fetch: async () => new Response('', { status: 404 }) }],
      ]}
    >
      <QueryClientProvider client={new QueryClient()}>
        <EpicChip epic={epic} variant={variant} />
      </QueryClientProvider>
    </TestApiProvider>,
  );
}

describe('EpicChip', () => {
  it('as text, opens the GitHub issue in a new tab and says so', async () => {
    await renderChip('link');

    const link = screen.getByRole('link', {
      name: '#123 (opens in a new tab)',
    });
    expect(link).toHaveAttribute('href', epic.url);
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it('as a badge, stays a control without the icon', async () => {
    await renderChip('badge');

    const link = screen.getByRole('link', { name: /Epic #123/ });
    expect(link).toHaveAttribute('href', epic.url);
    expect(link.querySelector('svg')).toBeNull();
  });
});
