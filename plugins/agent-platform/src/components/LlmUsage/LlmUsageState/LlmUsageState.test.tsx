import { render, screen } from '@testing-library/react';
import type { LlmUsage } from '../../../lib/llmUsage';
import type { LlmUsageViewModel } from '../../../hooks/useLlmUsageView';
import { LlmUsageState } from './LlmUsageState';

describe('LlmUsageState', () => {
  it('names the queried window when the gateway saw no model calls', () => {
    const view: LlmUsageViewModel = {
      state: 'empty',
      usage: { windowDays: 7 } as LlmUsage,
      installation: 'alpha',
      isResolvedFromAll: false,
      notReachable: [],
    };

    render(<LlmUsageState view={view} />);

    expect(
      screen.getByText(
        /No model calls went through alpha's LLM gateway over the last 7 days\./,
      ),
    ).toBeInTheDocument();
  });

  describe('when a query failed', () => {
    const errorView = (error: Error): LlmUsageViewModel => ({
      state: 'error',
      usage: undefined,
      installation: 'alpha',
      isResolvedFromAll: false,
      notReachable: [],
      error,
    });

    it('says older data is temporarily unavailable when Mimir said so', () => {
      render(
        <LlmUsageState
          view={errorView(
            Object.assign(new Error('Mimir could not answer'), {
              reason: 'older_data_unavailable',
            }),
          )}
        />,
      );

      expect(
        screen.getByText('Older data is temporarily unavailable'),
      ).toBeInTheDocument();
      expect(
        screen.queryByText(/Could not read 1 environment/),
      ).not.toBeInTheDocument();
    });

    it('names the environment it could not read otherwise', () => {
      render(<LlmUsageState view={errorView(new Error('boom'))} />);

      expect(
        screen.getByText(/Could not read 1 environment/),
      ).toBeInTheDocument();
      expect(
        screen.queryByText('Older data is temporarily unavailable'),
      ).not.toBeInTheDocument();
    });
  });
});
