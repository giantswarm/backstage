import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ConnectorLogo } from './ConnectorLogo';

describe('ConnectorLogo', () => {
  it("shows the name's first letter without an icon", () => {
    render(<ConnectorLogo name="weather" />);
    expect(screen.getByRole('img', { name: 'weather' })).toHaveTextContent('w');
  });

  it('shows a leading emoji whole', () => {
    render(<ConnectorLogo name="🚀 Deploys" />);
    expect(screen.getByRole('img', { name: '🚀 Deploys' })).toHaveTextContent(
      /^🚀$/u,
    );
  });

  it('shows the letter for an icon that is not a safe data: image', () => {
    render(
      <ConnectorLogo name="weather" icon="https://example.com/icon.png" />,
    );
    const logo = screen.getByRole('img', { name: 'weather' });
    expect(logo).toHaveTextContent('w');
    expect(logo.querySelector('img')).toBeNull();
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

  it('keeps one tooltip open: hovering a logo closes the focused one', async () => {
    const user = userEvent.setup();
    render(
      <>
        <ConnectorLogo name="PagerDuty" tooltip />
        <ConnectorLogo name="Slack" tooltip />
      </>,
    );
    await user.tab();
    expect(await screen.findByRole('tooltip')).toHaveTextContent('PagerDuty');

    await user.hover(screen.getByRole('img', { name: 'Slack' }));
    await waitFor(() => expect(screen.getAllByRole('tooltip')).toHaveLength(1));
    expect(screen.getByRole('tooltip')).toHaveTextContent('Slack');
  });
});
