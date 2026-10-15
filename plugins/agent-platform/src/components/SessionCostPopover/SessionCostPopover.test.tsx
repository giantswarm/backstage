import { renderInTestApp } from '@backstage/frontend-test-utils';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ConfigReader } from '@backstage/config';
import {
  __resetSignedInConfigForTests,
  setSignedInConfig,
} from '@giantswarm/backstage-plugin-gs-react';

import {
  SessionCostPopover,
  SessionCostPopoverProps,
} from './SessionCostPopover';

function publishConfig({
  contextWindows,
  currency,
}: {
  contextWindows?: Record<string, number>;
  currency?: { code: string; usdRate: number };
} = {}) {
  setSignedInConfig(
    new ConfigReader({
      ...(contextWindows && {
        agentPlatform: { models: { contextWindows } },
      }),
      ...(currency && {
        gs: { installations: { gazelle: { currency } } },
      }),
    }),
  );
}

const baseProps: SessionCostPopoverProps = {
  installation: 'gazelle',
  model: 'claude-sonnet-4-5',
  tokens: { total: 18200, prompt: 15600, completion: 2600 },
  context: { promptTokens: 24000, calls: 1 },
  taskCount: 3,
  estimatedCostUsd: 0.21,
  costBasis: 'Estimated: an observed rate.',
};

async function render(overrides: Partial<SessionCostPopoverProps> = {}) {
  await renderInTestApp(<SessionCostPopover {...baseProps} {...overrides} />);
}

/** The opened popover's dialog. */
async function open() {
  await userEvent.click(
    screen.getByRole('button', { name: /Session cost and context/ }),
  );
  return screen.getByRole('dialog', { name: 'Session cost and context' });
}

describe('SessionCostPopover', () => {
  beforeEach(() => __resetSignedInConfigForTests());

  it('shows the estimate, labeled as one, with the tokens behind it', async () => {
    publishConfig();
    await render();

    const dialog = await open();

    expect(within(dialog).getByText('Est. cost')).toBeInTheDocument();
    expect(within(dialog).getByText('$0.210')).toBeInTheDocument();
    expect(within(dialog).getByText('Tokens in / out')).toBeInTheDocument();
    expect(within(dialog).getByText('15.6k / 2.6k')).toBeInTheDocument();
    expect(within(dialog).getByText('Turns')).toBeInTheDocument();
    // The basis line is the disclosure that makes the figure honest.
    expect(
      within(dialog).getByText(/Estimated: an observed rate\./),
    ).toBeInTheDocument();
  });

  it('shows the reported cost beside the estimate when the runtime reported one', async () => {
    publishConfig();
    await render({
      tokens: { ...baseProps.tokens, costUsd: 0.13148115 },
    });

    const dialog = await open();

    expect(within(dialog).getByText('Reported cost')).toBeInTheDocument();
    expect(within(dialog).getByText('$0.131')).toBeInTheDocument();
    expect(within(dialog).getByText('$0.210')).toBeInTheDocument();
  });

  it('shows no reported cost when the runtime reported none', async () => {
    publishConfig();
    await render();

    const dialog = await open();

    expect(within(dialog).queryByText('Reported cost')).not.toBeInTheDocument();
  });

  it('reads “—” rather than $0.00 when no rate could be derived', async () => {
    // Zero spend and unpriced spend are different facts.
    publishConfig();
    await render({ estimatedCostUsd: undefined, context: undefined });

    const dialog = await open();

    const row = within(dialog).getByText('Est. cost')
      .parentElement as HTMLElement;
    expect(within(row).getByText('—')).toBeInTheDocument();
  });

  it('shows context used as a share of a configured context window', async () => {
    publishConfig({ contextWindows: { 'claude-*': 200000 } });
    await render();

    const dialog = await open();

    // 24k of the newest call against the 200k window.
    expect(within(dialog).getByText('Context used')).toBeInTheDocument();
    expect(
      within(dialog).getByText('24.0k of 200.0k · 12%'),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByRole('img', { name: 'Context 12% full' }),
    ).toBeInTheDocument();
  });

  it('falls back to the raw token count when the window is unknown', async () => {
    publishConfig({ contextWindows: { 'gpt-5': 400000 } });
    await render();

    // The chip's name carries the same count, not a bare cost.
    expect(
      screen.getByRole('button', {
        name: 'Session cost and context: $0.210, 24.0k tokens of context',
      }),
    ).toBeInTheDocument();

    const dialog = await open();

    // The count without a share: claiming a percentage of an unknown window
    // would be invented precision.
    expect(within(dialog).getByText('24.0k tokens')).toBeInTheDocument();
    expect(
      within(dialog).queryByRole('img', { name: /Context/ }),
    ).not.toBeInTheDocument();
  });

  it('shows the raw count, not a capped share, above the configured window', async () => {
    // A model cannot be sent more than its window, so a count above the
    // configured one means the table is wrong. "969.0k of 200.0k · 100%"
    // contradicted itself; the count stands and the window is called out.
    publishConfig({ contextWindows: { 'claude-*': 200000 } });
    await render({ context: { promptTokens: 969000, calls: 1 } });

    expect(
      screen.getByRole('button', {
        name: 'Session cost and context: $0.210, 969.0k tokens of context',
      }),
    ).toBeInTheDocument();

    const dialog = await open();

    expect(within(dialog).getByText('969.0k tokens')).toBeInTheDocument();
    expect(
      within(dialog).getByText(
        'Above the 200.0k context window configured for this model, so that setting looks too small.',
      ),
    ).toBeInTheDocument();
    expect(within(dialog).queryByText(/%/)).not.toBeInTheDocument();
    expect(
      within(dialog).queryByRole('img', { name: /Context/ }),
    ).not.toBeInTheDocument();
  });

  it('claims no context from a turn total summed over several calls', async () => {
    // The claude Harness reports one bag per turn, summed over its calls.
    publishConfig({ contextWindows: { 'claude-*': 200000 } });
    await render({ context: { promptTokens: 70958, calls: 4 } });

    expect(
      screen.getByRole('button', { name: 'Session cost and context: $0.210' }),
    ).toBeInTheDocument();

    const dialog = await open();

    const row = within(dialog).getByText('Context used')
      .parentElement as HTMLElement;
    expect(within(row).getByText('Not reported')).toBeInTheDocument();
    expect(
      within(dialog).queryByRole('img', { name: /Context/ }),
    ).not.toBeInTheDocument();
  });

  it('keeps the footnote to the one basis sentence', async () => {
    // The popover's explanatory text is a single minimal sentence — the
    // disclosure that keeps the estimate honest. The paragraphs about
    // reported costs and the context approximation are gone.
    publishConfig({ contextWindows: { 'claude-*': 200000 } });
    await render({ tokens: { ...baseProps.tokens, costUsd: 0.13148115 } });

    const dialog = await open();

    expect(
      within(dialog).getByText('Estimated: an observed rate.'),
    ).toBeInTheDocument();
    expect(
      within(dialog).queryByText(/reported cost comes from/),
    ).not.toBeInTheDocument();
    expect(
      within(dialog).queryByText(/an approximation, summed over/),
    ).not.toBeInTheDocument();
  });

  it('shows costs in the installation’s configured currency', async () => {
    publishConfig({ currency: { code: 'EUR', usdRate: 1 } });
    await render({
      tokens: { ...baseProps.tokens, costUsd: 0.13148115 },
    });

    const dialog = await open();

    expect(within(dialog).getByText('€0.210')).toBeInTheDocument();
    expect(within(dialog).getByText('€0.131')).toBeInTheDocument();
  });

  it('leads the chip with the reported cost when there is one', async () => {
    publishConfig();
    await render({
      tokens: { ...baseProps.tokens, costUsd: 0.5 },
    });

    expect(
      screen.getByRole('button', {
        name: /Session cost and context: \$0\.500/,
      }),
    ).toBeInTheDocument();
  });

  it('names no agent — the page is already that agent’s session', async () => {
    publishConfig();
    await render();

    const dialog = await open();

    expect(within(dialog).queryByText('Agent')).not.toBeInTheDocument();
  });
});
