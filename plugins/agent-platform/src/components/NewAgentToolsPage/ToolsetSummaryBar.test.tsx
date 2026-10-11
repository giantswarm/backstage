import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  mockDesktopLayout,
  mockPhoneLayout,
  type MockedLayout,
} from '@giantswarm/backstage-plugin-ui-react';

import type { ToolsetResolution } from '../../hooks/useToolsetResolution';
import { ToolsetSummaryBar } from './ToolsetSummaryBar';

const readTool = {
  name: 'core_service_list',
  annotations: { readOnlyHint: true },
} as unknown as ToolsetResolution['tools'][number];

const resolved: ToolsetResolution = {
  tools: [readTool, { ...readTool, name: 'core_service_get' }],
  unmatched: [],
  truncated: false,
  isLoading: false,
  status: 'resolved',
};

function renderBar(onRemove = jest.fn()) {
  render(
    <ToolsetSummaryBar
      selectors={['preset:read-only', 'tool:x_kubernetes_get_pod_logs']}
      onRemove={onRemove}
      resolution={resolved}
      unsigned={[]}
      problems={[]}
      onShowDetails={jest.fn()}
    />,
  );
  return { onRemove };
}

describe('ToolsetSummaryBar', () => {
  let layout: MockedLayout;
  afterEach(() => layout.restore());

  it('shows the chips and the effect at once on a desktop', () => {
    layout = mockDesktopLayout();
    renderBar();

    const bar = screen.getByRole('region', { name: 'Selected so far' });
    expect(within(bar).getAllByRole('listitem')).toHaveLength(2);
    expect(within(bar).getByText('Resolves to 2 tools for you')).toBeVisible();
    expect(
      within(bar).queryByRole('button', { expanded: false }),
    ).not.toBeInTheDocument();
  });

  describe('at phone width', () => {
    beforeEach(() => {
      layout = mockPhoneLayout();
    });

    it('is one line saying how many are selected and what they resolve to', () => {
      renderBar();

      const bar = screen.getByRole('region', { name: 'Selected so far' });
      const toggle = within(bar).getByRole('button', {
        name: '2 selected · Resolves to 2 tools for you',
      });
      expect(toggle).toHaveAttribute('aria-expanded', 'false');
      expect(within(bar).queryByRole('listitem')).not.toBeInTheDocument();
    });

    it('opens to the removable chips', async () => {
      const { onRemove } = renderBar();

      const bar = screen.getByRole('region', { name: 'Selected so far' });
      const toggle = within(bar).getByRole('button', { name: /2 selected/ });
      await userEvent.click(toggle);

      expect(toggle).toHaveAttribute('aria-expanded', 'true');
      expect(within(bar).getAllByRole('listitem')).toHaveLength(2);
      expect(
        within(bar).getByRole('button', { name: 'Show the resolved list' }),
      ).toBeInTheDocument();
      await userEvent.click(
        within(bar).getByRole('button', { name: /^Remove .*pod_logs/ }),
      );
      expect(onRemove).toHaveBeenCalledWith('tool:x_kubernetes_get_pod_logs');
    });

    it('gives the remove buttons a thumb-sized target', () => {
      renderBar();

      const css = Array.from(document.querySelectorAll('style'))
        .map(style => style.textContent)
        .join('\n');
      expect(css).toMatch(
        /@media \(max-width: 599\.95px\), \(hover: none\) and \(pointer: coarse\)\s*\{[^}]*min-width: 44px/,
      );
    });
  });
});
