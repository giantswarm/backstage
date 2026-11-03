import { renderInTestApp } from '@backstage/frontend-test-utils';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { parseWorkspaceNotice } from '../../../lib/workspaceNotice';
import {
  NOTICE_FAILED,
  NOTICE_RECOVERED,
  NOTICE_RESET,
  NOTICE_STALE,
} from '../../../lib/__fixtures__/workspaceNotice';
import { WorkspaceNoticeEntry } from './WorkspaceNoticeEntry';

async function renderNotice(text: string) {
  await renderInTestApp(
    <WorkspaceNoticeEntry notice={parseWorkspaceNotice(text)} />,
  );
  return screen.getByTestId('timeline-workspace-notice');
}

describe('WorkspaceNoticeEntry', () => {
  it('says how many repositories were not updated, with git’s reasons folded', async () => {
    const entry = await renderNotice(NOTICE_STALE);

    expect(entry).toHaveAttribute('data-severity', 'warning');
    expect(
      within(entry).getByText('Workspace setup: 3 repositories not updated'),
    ).toBeInTheDocument();
    const details = within(entry).getByRole('button', {
      name: 'Technical details',
    });
    expect(details).toHaveAttribute('aria-expanded', 'false');

    await userEvent.click(details);
    expect(details).toHaveAttribute('aria-expanded', 'true');
    expect(
      within(entry).getByText(
        'These repositories stay at the workspace’s last sync:',
      ),
    ).toBeInTheDocument();
    expect(within(entry).getByText('acme/app')).toBeInTheDocument();
    expect(within(entry).getAllByText(/commit graph/)).toHaveLength(3);
  });

  it('reports repositories up to date again as information', async () => {
    const entry = await renderNotice(NOTICE_RECOVERED);

    expect(entry).toHaveAttribute('data-severity', 'info');
    expect(
      within(entry).getByText(
        'Workspace setup: 3 repositories up to date again',
      ),
    ).toBeInTheDocument();

    await userEvent.click(
      within(entry).getByRole('button', { name: 'Technical details' }),
    );
    expect(within(entry).getByText('acme/infra')).toBeInTheDocument();
  });

  it('says a failed setup is a warning, with the error folded', async () => {
    const entry = await renderNotice(NOTICE_FAILED);

    expect(entry).toHaveAttribute('data-severity', 'warning');
    expect(
      within(entry).getByText('Workspace setup failed'),
    ).toBeInTheDocument();
    expect(
      within(entry).getByText('This session’s directory could not be set up.'),
    ).toBeInTheDocument();

    await userEvent.click(
      within(entry).getByRole('button', { name: 'Technical details' }),
    );
    expect(
      within(entry).getByText(/no space left on device/),
    ).toBeInTheDocument();
  });

  it('keeps what a reset directory lost in sight, with nothing to fold', async () => {
    const entry = await renderNotice(NOTICE_RESET);

    expect(entry).toHaveAttribute('data-severity', 'warning');
    expect(
      within(entry).getByText('Workspace setup: directory set up again'),
    ).toBeInTheDocument();
    expect(
      within(entry).getByText(/what was not pushed is gone\.$/),
    ).toBeInTheDocument();
    expect(
      within(entry).queryByRole('button', { name: 'Technical details' }),
    ).not.toBeInTheDocument();
  });

  it('titles a combined notice by its first warning and lists the rest under it', async () => {
    const entry = await renderNotice(`${NOTICE_RECOVERED}\n${NOTICE_STALE}`);

    expect(entry).toHaveAttribute('data-severity', 'warning');
    expect(
      within(entry).getByText('Workspace setup: 3 repositories not updated'),
    ).toBeInTheDocument();
    expect(
      within(entry).getByText(
        'Workspace setup: 3 repositories up to date again',
      ),
    ).toBeInTheDocument();
  });
});
