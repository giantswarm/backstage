import { render, screen } from '@testing-library/react';
import { UsagePage } from './UsagePage';

jest.mock('../AgentUsageSection', () => ({
  AgentUsageSection: () => <h3>Your agent usage</h3>,
}));

describe('UsagePage', () => {
  it('heads the page neutrally, above the sections', () => {
    // The bug this guards: without a page heading, the first section's heading
    // was the topmost and only one in the content, so "Your agent usage" read
    // as scoping everything below it — including a section that is every
    // caller's. The page heading has to outrank both sections and claim
    // neither.
    render(
      <UsagePage sections={<h3>MCP tool calls on this installation</h3>} />,
    );

    const pageHeading = screen.getByRole('heading', { level: 2 });
    expect(pageHeading).toHaveTextContent('Usage');

    const sectionHeadings = screen
      .getAllByRole('heading', { level: 3 })
      .map(node => node.textContent);
    expect(sectionHeadings).toEqual([
      'Your agent usage',
      'MCP tool calls on this installation',
    ]);
  });

  it('claims no ownership and no window in its own heading', () => {
    // It cannot: whether the numbers are the reader's is resolved per
    // installation inside the section, and the window is configurable and
    // arrives in the response. Either asserted here could be false.
    render(<UsagePage />);

    const pageHeading = screen.getByRole('heading', { level: 2 });
    const intro = pageHeading.parentElement?.textContent ?? '';
    expect(intro).not.toMatch(/\byour\b/i);
    expect(intro).not.toMatch(/\d+\s*days/i);
    // And it does say the scopes differ, which is the whole point.
    expect(intro).toMatch(/different scopes/i);
  });

  it('renders the personal section with no contributed section at all', () => {
    // What a portal without muster gets: one section, not a hole.
    render(<UsagePage />);

    expect(screen.getByText('Your agent usage')).toBeInTheDocument();
    expect(
      screen.queryByText('MCP tool calls on this installation'),
    ).not.toBeInTheDocument();
  });
});
