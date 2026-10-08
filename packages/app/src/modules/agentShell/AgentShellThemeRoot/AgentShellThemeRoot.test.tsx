import { render } from '@testing-library/react';
import { AgentShellThemeRoot } from './AgentShellThemeRoot';

describe('AgentShellThemeRoot', () => {
  afterEach(() => {
    delete document.documentElement.dataset.agentShell;
  });

  it('renders nothing', () => {
    const { container } = render(<AgentShellThemeRoot />);
    expect(container).toBeEmptyDOMElement();
  });

  it('marks the document root while mounted', () => {
    const { unmount } = render(<AgentShellThemeRoot />);
    expect(document.documentElement).toHaveAttribute('data-agent-shell', '');

    unmount();
    expect(document.documentElement).not.toHaveAttribute('data-agent-shell');
  });
});
