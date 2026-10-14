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
        /No model calls went through alpha's LLM gateway in the last 7 days\./,
      ),
    ).toBeInTheDocument();
  });
});
