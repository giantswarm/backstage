import { screen } from '@testing-library/react';
import { renderInTestApp } from '@backstage/frontend-test-utils';
import { UsageConnectorsPage } from './UsageConnectorsPage';

describe('UsageConnectorsPage', () => {
  it('renders the contributed connector sections under a caption naming their window', async () => {
    await renderInTestApp(
      <UsageConnectorsPage
        sections={[<div key="mcp">contributed tool-call section</div>]}
      />,
    );

    expect(
      await screen.findByText('contributed tool-call section'),
    ).toBeInTheDocument();
    // muster's metrics do not follow the screen's time-range control.
    expect(
      screen.getByText(/cover the last 30 days whatever time range/),
    ).toBeInTheDocument();
  });
});
