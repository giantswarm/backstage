import { render, screen } from '@testing-library/react';
import { ContentColumn, SHELL_CONTENT_MAX_WIDTH } from './ContentColumn';

describe('ContentColumn', () => {
  it('centers its content at the shell content width', () => {
    // The same max-width + auto-margin idiom as ShellPage, so a view without
    // ShellPage lines up with the pages that have it.
    render(
      <ContentColumn>
        <div>inside</div>
      </ContentColumn>,
    );

    const column = screen.getByText('inside').parentElement!;
    expect(column).toHaveStyle({
      width: '100%',
      maxWidth: `${SHELL_CONTENT_MAX_WIDTH}px`,
      margin: '0 auto',
    });
  });
});
