import {
  mockDesktopLayout,
  mockPhoneLayout,
  type MockedLayout,
} from '@giantswarm/backstage-plugin-ui-react/testUtils';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { LlmModelRow } from '../../../lib/llmUsage';
import { LlmByModelTable } from './LlmByModelTable';

const ROWS: LlmModelRow[] = [
  {
    id: 'sonnet',
    model: 'claude-sonnet-5',
    tokens: 6_000_000,
    calls: 60,
    costUsd: 30,
    usdPerMillion: 5,
    avgTokensPerCall: 100_000,
    sharePct: 75,
  },
  {
    id: 'haiku',
    model: 'claude-haiku-4-5',
    tokens: 4_000_000,
    calls: 400,
    costUsd: 10,
    usdPerMillion: 2.5,
    avgTokensPerCall: 10_000,
    sharePct: 25,
  },
];

function renderedOrder(): string[] {
  return screen
    .getAllByRole('rowheader')
    .map(cell => cell.textContent?.trim() ?? '');
}

describe('LlmByModelTable', () => {
  it('opens sorted by spend, descending', () => {
    render(<LlmByModelTable rows={ROWS} emptyMessage="none" />);

    expect(renderedOrder()).toEqual(['claude-sonnet-5', 'claude-haiku-4-5']);
  });

  it('re-orders the rendered rows when a column is sorted', async () => {
    render(<LlmByModelTable rows={ROWS} emptyMessage="none" />);

    // Tokens, not Model calls: a first click sorts ascending, and ascending
    // by calls happens to match the opening spend-descending order — so that
    // column would pass this test even with the sort broken. Tokens flips it.
    await userEvent.click(screen.getByRole('columnheader', { name: /Tokens/ }));

    expect(renderedOrder()).toEqual(['claude-haiku-4-5', 'claude-sonnet-5']);
  });

  it('shows an em dash for a ratio that could not be derived', () => {
    render(
      <LlmByModelTable
        rows={[
          {
            ...ROWS[0],
            costUsd: undefined,
            usdPerMillion: undefined,
            avgTokensPerCall: undefined,
          },
        ]}
        emptyMessage="none"
      />,
    );

    // Cost, $/1M and average tokens per call.
    expect(screen.getAllByText('—')).toHaveLength(3);
  });

  it('renders the empty message with no rows', () => {
    render(<LlmByModelTable rows={[]} emptyMessage="No model answered." />);

    expect(screen.getByText('No model answered.')).toBeInTheDocument();
  });

  describe('at scale', () => {
    const THREE: LlmModelRow[] = [
      ...ROWS,
      { ...ROWS[1], id: 'opus', model: 'claude-opus-5', costUsd: 5 },
    ];

    /** 300 models, spend falling with the index so the ranking is known. */
    const MANY: LlmModelRow[] = Array.from({ length: 300 }, (_, i) => ({
      id: `model-${i}`,
      model: `model-${String(i).padStart(3, '0')}`,
      tokens: 1_000 * (300 - i),
      calls: 300 - i,
      costUsd: 300 - i,
      usdPerMillion: 1,
      avgTokensPerCall: 1_000,
      sharePct: (300 - i) / 450,
    }));

    it('shows three models with no reveal control and no pagination', () => {
      render(<LlmByModelTable rows={THREE} emptyMessage="none" />);

      expect(screen.getAllByRole('rowheader')).toHaveLength(3);
      expect(screen.queryByRole('button', { name: /^Show/ })).toBeNull();
      // bui's pagination footer carries a page-size select and a range label.
      expect(screen.queryByRole('combobox')).toBeNull();
      expect(screen.queryByText(/of 3/)).toBeNull();
    });

    it('renders the top 15 spenders of 300 and offers the rest', async () => {
      // Shuffled input: the slice must come after the sort.
      render(
        <LlmByModelTable rows={[...MANY].reverse()} emptyMessage="none" />,
      );

      const order = renderedOrder();
      expect(order).toHaveLength(15);
      expect(order[0]).toBe('model-000');
      expect(order[14]).toBe('model-014');
      expect(screen.queryByRole('combobox')).toBeNull();
      expect(
        screen.getByRole('button', { name: 'Show all 300 models' }),
      ).toBeVisible();
    });

    it('reveals every model in one click', async () => {
      // 30 rather than 300: the same click, without mounting 300 rows of
      // data bars in jsdom.
      render(<LlmByModelTable rows={MANY.slice(0, 30)} emptyMessage="none" />);

      await userEvent.click(
        screen.getByRole('button', { name: 'Show all 30 models' }),
      );
      expect(renderedOrder()).toHaveLength(30);
      expect(screen.getByRole('button', { name: 'Show fewer' })).toBeVisible();
    });

    it('slices after a column sort, not before it', async () => {
      render(<LlmByModelTable rows={MANY} emptyMessage="none" />);

      // Ascending by tokens: the smallest of all 300 come first.
      await userEvent.click(
        screen.getByRole('columnheader', { name: /Tokens/ }),
      );

      const order = renderedOrder();
      expect(order).toHaveLength(15);
      expect(order[0]).toBe('model-299');
    });
  });
});

// T22 B10: six columns in 343px clipped every figure and cut a model id to "a…".
describe('LlmByModelTable at phone width', () => {
  let layout: MockedLayout;
  afterEach(() => layout.restore());

  const headers = () =>
    screen.getAllByRole('columnheader').map(cell => cell.textContent?.trim());

  it('keeps the model, its cost and its tokens per call, the model on two lines', () => {
    layout = mockPhoneLayout();
    render(<LlmByModelTable rows={ROWS} emptyMessage="none" />);

    expect(headers()).toEqual(['Model', 'Spend', 'Avg tokens/call']);
    const name = screen.getByText(ROWS[0].model);
    // Wraps to two lines rather than truncating to one, and no `title=`.
    expect(name).not.toHaveAttribute('data-truncate');
    expect(name).not.toHaveAttribute('title');
  });

  it('keeps every column on a desktop', () => {
    layout = mockDesktopLayout();
    render(<LlmByModelTable rows={ROWS} emptyMessage="none" />);

    expect(headers()).toHaveLength(6);
  });
});
