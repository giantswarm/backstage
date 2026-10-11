import { screen } from '@testing-library/react';
import { renderInTestApp } from '@backstage/frontend-test-utils';
import { UsageConnectorsPage } from './UsageConnectorsPage';

describe('UsageConnectorsPage', () => {
  it('renders the contributed connector sections, with no caveat about the window', async () => {
    await renderInTestApp(
      <UsageConnectorsPage
        sections={[<div key="mcp">contributed tool-call section</div>]}
      />,
    );

    expect(
      await screen.findByText('contributed tool-call section'),
    ).toBeInTheDocument();
    // The section follows the screen's time-range control (QA round 1), so
    // nothing says it ignores it.
    expect(screen.queryByText(/ignore the selected time range/)).toBeNull();
  });
});
