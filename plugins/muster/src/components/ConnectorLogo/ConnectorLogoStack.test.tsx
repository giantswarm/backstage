import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ConnectorLogoStack } from './ConnectorLogoStack';

const connectors = [
  { name: 'Gmail' },
  { name: 'Google Drive' },
  { name: 'Slack' },
  { name: 'PagerDuty' },
];

describe('ConnectorLogoStack', () => {
  it('renders nothing without connectors', () => {
    const { container } = render(<ConnectorLogoStack connectors={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('shows every logo when they fit', () => {
    render(<ConnectorLogoStack connectors={connectors.slice(0, 3)} />);
    expect(
      screen.getAllByRole('img').map(img => img.getAttribute('aria-label')),
    ).toEqual(['Gmail', 'Google Drive', 'Slack']);
    expect(screen.queryByText(/more connectors/)).not.toBeInTheDocument();
  });

  it('shows max - 1 logos and "+N" for the rest', () => {
    render(<ConnectorLogoStack connectors={connectors} />);
    expect(
      screen.getAllByRole('img').map(img => img.getAttribute('aria-label')),
    ).toEqual(['Gmail', 'Google Drive']);
    expect(screen.getByText('+2')).toBeInTheDocument();
    expect(screen.getByText('2 more connectors')).toBeInTheDocument();
  });

  it('honours a smaller max', () => {
    render(<ConnectorLogoStack connectors={connectors} max={2} />);
    expect(screen.getAllByRole('img')).toHaveLength(1);
    expect(screen.getByText('+3')).toBeInTheDocument();
  });

  it("names a logo's connector in its tooltip", async () => {
    const user = userEvent.setup();
    render(<ConnectorLogoStack connectors={connectors} />);
    await user.hover(screen.getByRole('img', { name: 'Gmail' }));
    expect(await screen.findByRole('tooltip')).toHaveTextContent('Gmail');
  });

  it('lists the remaining connectors in the "+N" tooltip', async () => {
    const user = userEvent.setup();
    render(<ConnectorLogoStack connectors={connectors} />);
    await user.hover(screen.getByText('+2'));
    expect(await screen.findByRole('tooltip')).toHaveTextContent(
      /Slack\s*PagerDuty/,
    );
  });
});
