import { renderInTestApp } from '@backstage/frontend-test-utils';
import { TestApiProvider } from '@backstage/test-utils';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { kagentApiRef } from '../../apis';
import { KagentApi } from '../../apis/types';
import { SessionShareDialog } from './SessionShareDialog';

const listSessionShares = jest.fn();
const createSessionShare = jest.fn();
const revokeSessionShare = jest.fn();

const kagentApi = {
  listSessionShares,
  createSessionShare,
  revokeSessionShare,
} as unknown as KagentApi;

const onOpenChange = jest.fn();

const renderDialog = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  return renderInTestApp(
    <TestApiProvider apis={[[kagentApiRef, kagentApi]]}>
      <QueryClientProvider client={queryClient}>
        <SessionShareDialog
          installation="gazelle"
          sessionId="abc"
          isOpen
          onOpenChange={onOpenChange}
        />
      </QueryClientProvider>
    </TestApiProvider>,
  );
};

const writeText = jest.fn();

beforeEach(() => {
  listSessionShares.mockReset();
  createSessionShare.mockReset();
  revokeSessionShare.mockReset();
  onOpenChange.mockReset();
  writeText.mockReset();
  listSessionShares.mockResolvedValue([]);
  revokeSessionShare.mockResolvedValue(undefined);
  createSessionShare.mockResolvedValue({
    token: 'secret-token',
    share: { id: 'share-new', permission: 'read-only' },
  });
  writeText.mockResolvedValue(undefined);
  Object.assign(navigator, { clipboard: { writeText } });
});

describe('SessionShareDialog', () => {
  it('says so when the session has no active shares', async () => {
    await renderDialog();

    await waitFor(() =>
      expect(
        screen.getByText('This session has no active shares.'),
      ).toBeInTheDocument(),
    );
    // And is honest about what the token is for: no portal link exists.
    expect(
      screen.getByText(/cannot open shared sessions yet/),
    ).toBeInTheDocument();
  });

  it('creates a share with the safe defaults and shows the token once', async () => {
    await renderDialog();

    await userEvent.click(
      screen.getByRole('button', { name: 'Create share token' }),
    );

    // Read-only and 24 hours: the grant nobody should have to think about.
    await waitFor(() =>
      expect(createSessionShare).toHaveBeenCalledWith('gazelle', 'abc', {
        permission: 'read-only',
        ttlSeconds: 24 * 60 * 60,
      }),
    );
    const tokenField = await screen.findByRole('textbox', {
      name: 'Share token',
    });
    expect(tokenField).toHaveValue('secret-token');
    expect(screen.getByText(/shown only once/)).toBeInTheDocument();
  });

  it('copies the token to the clipboard', async () => {
    await renderDialog();

    await userEvent.click(
      screen.getByRole('button', { name: 'Create share token' }),
    );
    await screen.findByRole('textbox', { name: 'Share token' });

    await userEvent.click(screen.getByRole('button', { name: 'Copy token' }));

    expect(writeText).toHaveBeenCalledWith('secret-token');
    await screen.findByRole('button', { name: 'Copied' });
  });

  it('reports a failed create in place, keeping the dialog open', async () => {
    createSessionShare.mockRejectedValue(new Error('kagent refused the share'));
    await renderDialog();

    await userEvent.click(
      screen.getByRole('button', { name: 'Create share token' }),
    );

    await screen.findByText('kagent refused the share');
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it('lists the existing shares with what each grants, and revokes one', async () => {
    listSessionShares.mockResolvedValue([
      {
        id: 'share-1',
        permission: 'read-only',
        createdAt: '2026-10-09T10:00:00Z',
        expiresAt: '2026-10-10T10:00:00Z',
      },
      {
        id: 'share-2',
        permission: 'read-write',
        createdAt: '2026-10-09T10:00:00Z',
      },
    ]);
    await renderDialog();

    // `findAllByText`: the permission labels double as the Access select's
    // option texts, so an exact-match single query would be ambiguous.
    expect((await screen.findAllByText('Read only')).length).toBeGreaterThan(0);
    expect(screen.getAllByText('Read and write').length).toBeGreaterThan(0);
    // A share without an expiry says so rather than showing a blank.
    expect(screen.getByText(/does not expire/)).toBeInTheDocument();

    const revokeButtons = screen.getAllByRole('button', { name: 'Revoke' });
    expect(revokeButtons).toHaveLength(2);
    await userEvent.click(revokeButtons[0]);

    await waitFor(() =>
      expect(revokeSessionShare).toHaveBeenCalledWith(
        'gazelle',
        'abc',
        'share-1',
      ),
    );
  });

  it('reports a failed revoke above the list', async () => {
    listSessionShares.mockResolvedValue([
      { id: 'share-1', permission: 'read-only' },
    ]);
    revokeSessionShare.mockRejectedValue(new Error('already gone'));
    await renderDialog();

    await userEvent.click(
      await screen.findByRole('button', { name: 'Revoke' }),
    );

    expect(await screen.findByText('already gone')).toBeInTheDocument();
  });

  it('reports an unreadable share list without blocking the create', async () => {
    listSessionShares.mockRejectedValue(new Error('kagent is unreachable'));
    await renderDialog();

    await screen.findByText('kagent is unreachable');
    expect(
      screen.getByRole('button', { name: 'Create share token' }),
    ).toBeEnabled();
  });
});
