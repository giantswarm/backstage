import { render, screen } from '@testing-library/react';
import { UsageColumn, USAGE_COLUMN_MAX_WIDTH } from './UsageColumn';

describe('UsageColumn', () => {
  it('centers its content at the platform content width', () => {
    // The same max-width + auto-margin idiom as ShellPage (Customize,
    // Sessions): the Usage screen must read like the rest of the platform
    // rather than filling the whole content view.
    render(
      <UsageColumn>
        <div>inside</div>
      </UsageColumn>,
    );

    const column = screen.getByText('inside').parentElement!;
    expect(column).toHaveStyle({
      width: '100%',
      maxWidth: `${USAGE_COLUMN_MAX_WIDTH}px`,
      margin: '0 auto',
    });
  });
});
