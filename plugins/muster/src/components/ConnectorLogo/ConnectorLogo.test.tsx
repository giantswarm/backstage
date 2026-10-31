import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ConnectorLogo } from './ConnectorLogo';

describe('ConnectorLogo', () => {
  it("shows the name's first letter without an icon or a known host", () => {
    render(<ConnectorLogo name="weather" url="https://weather.example.com" />);
    expect(screen.getByRole('img', { name: 'weather' })).toHaveTextContent('w');
  });

  it("shows the brand's mark for a known host", () => {
    render(
      <ConnectorLogo name="Tickets" url="https://mcp.pagerduty.com/mcp" />,
    );
    const logo = screen.getByRole('img', { name: 'Tickets' });
    expect(logo).toHaveTextContent('');
    expect(logo.querySelector('svg')).toBeInTheDocument();
  });

  it('falls back to the letter while an icon has not loaded', () => {
    render(
      <ConnectorLogo name="github" icon="data:image/png;base64,iVBORw0KGgo=" />,
    );
    expect(screen.getByRole('img', { name: 'github' })).toHaveTextContent('G');
  });

  it('is hidden from assistive technology when decorative', () => {
    render(<ConnectorLogo name="weather" decorative />);
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });

  it('names the connector in a tooltip on keyboard focus', async () => {
    render(<ConnectorLogo name="PagerDuty" detail="All tools" tooltip />);
    await userEvent.tab();
    expect(await screen.findByRole('tooltip')).toHaveTextContent(
      /PagerDuty\s*All tools/,
    );
  });
});
