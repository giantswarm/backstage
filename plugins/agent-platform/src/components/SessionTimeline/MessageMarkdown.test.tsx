import { renderInTestApp } from '@backstage/frontend-test-utils';
import { screen } from '@testing-library/react';
import { MessageMarkdown } from './MessageMarkdown';

describe('MessageMarkdown', () => {
  it.each([
    '/workspace/giantswarm/bumblebee-plans/plan/grill-sessions/session.md',
    '/data/workspace/plan/PRD.md',
  ])('shows session path %s without routing to a portal page', async file => {
    await renderInTestApp(<MessageMarkdown text={`[Grill log](${file})`} />);

    expect(screen.queryByRole('link', { name: 'Grill log' })).toBeNull();
    expect(screen.getByText(file)).toBeInTheDocument();
    expect(screen.getByText(/session file/)).toBeInTheDocument();
  });

  it('keeps whole words in table cells, so a wide table scrolls instead', async () => {
    await renderInTestApp(
      <MessageMarkdown
        text={
          '| kubernetes_namespace | status |\n| - | - |\n| giantswarm | ok |'
        }
      />,
    );

    expect(
      screen.getByRole('columnheader', { name: 'kubernetes_namespace' }),
    ).toHaveStyle({ overflowWrap: 'normal' });
    expect(screen.getByRole('cell', { name: 'giantswarm' })).toHaveStyle({
      overflowWrap: 'normal',
    });
  });
});
