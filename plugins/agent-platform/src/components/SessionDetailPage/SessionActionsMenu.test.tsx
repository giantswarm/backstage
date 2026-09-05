import { renderInTestApp } from '@backstage/frontend-test-utils';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { sessionsRouteRef } from '../../routes';
import type { UseDeleteSessionResult } from '../../hooks/useDeleteSession';
import { SessionActionsMenu } from './SessionActionsMenu';

// The delete state arrives as a prop — the menu renders in the shared plugin
// header, outside the plugin's QueryClientProvider, so it cannot call the hook
// itself. This test is therefore about what the menu offers and what it does with
// the outcome; the request and the cache handling are covered by
// useDeleteSession.test.tsx.
const mockNavigate = jest.fn();

jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useNavigate: () => mockNavigate,
}));

const mockToastPost = jest.fn();

// Only the toast API is swapped out — everything else the test app looks up
// (themes, route resolution) has to keep working.
jest.mock('@backstage/frontend-plugin-api', () => {
  const actual = jest.requireActual('@backstage/frontend-plugin-api');

  return {
    ...actual,
    useApi: (ref: unknown) =>
      ref === actual.toastApiRef ? { post: mockToastPost } : actual.useApi(ref),
  };
});

const deleteSession = jest.fn();
const reset = jest.fn();
const onRename = jest.fn();

let deletion: UseDeleteSessionResult;

function setDeleteState(overrides: Partial<UseDeleteSessionResult> = {}) {
  deletion = {
    deleteSession,
    isDeleting: false,
    error: null,
    reset,
    ...overrides,
  } as UseDeleteSessionResult;
}

const renderMenu = (isUserScoped?: boolean) =>
  renderInTestApp(
    <SessionActionsMenu
      title="What issues are assigned to me?"
      deletion={deletion}
      onRename={onRename}
      isUserScoped={isUserScoped}
    />,
    { mountedRoutes: { '/agent-platform/sessions': sessionsRouteRef } },
  );

async function openMenu() {
  await userEvent.click(
    screen.getByRole('button', { name: 'Session actions' }),
  );
}

async function openDeleteDialog() {
  await openMenu();
  await userEvent.click(
    screen.getByRole('menuitem', { name: /Delete session/ }),
  );
}

beforeEach(() => {
  mockNavigate.mockReset();
  mockToastPost.mockReset();
  deleteSession.mockReset();
  deleteSession.mockResolvedValue(undefined);
  reset.mockReset();
  onRename.mockReset();
  setDeleteState();
});

describe('SessionActionsMenu', () => {
  it('renders without a QueryClient in scope', async () => {
    // The regression this file exists to prevent. The menu is rendered into the
    // shared plugin header, which is outside the plugin's QueryClientProvider, so
    // a react-query hook called here throws "No QueryClient set" and takes the
    // whole page down with it — the delete state has to arrive as a prop.
    // `renderInTestApp` deliberately provides no client, so this asserts it.
    await renderMenu();

    expect(
      screen.getByRole('button', { name: 'Session actions' }),
    ).toBeInTheDocument();
  });

  it('gives the menu a definite width', async () => {
    // Not cosmetic, and the reason is invisible from here: bui leaves the menu's
    // width to its content above a 150px minimum, and this menu's one item wants
    // slightly more than that — so the popover renders wide, settles back to the
    // minimum, and that second layout pass makes react-aria's resize observer
    // trip the browser's "ResizeObserver loop completed with undelivered
    // notifications", which the dev-server overlay throws in your face on every
    // open. See the comment on MENU_WIDTH. jsdom does no layout, so this can only
    // assert the width is set — that is still enough to catch its removal.
    await renderMenu();
    await openMenu();

    // Read the specified value rather than using `toHaveStyle`: that goes
    // through getComputedStyle, which resolves `rem` against the root font size
    // since jsdom 29, so it reports `192px` and says nothing about what the
    // component asked for.
    expect(screen.getByRole('menu').style.width).toBe('12rem');
  });

  it('says what deleting actually means before doing it', async () => {
    await renderMenu();
    await openDeleteDialog();

    await waitFor(() => {
      expect(
        screen.getByText('Delete session "What issues are assigned to me?"?'),
      ).toBeInTheDocument();
    });
    // Both halves of the truth: gone as far as anyone here is concerned, and not
    // restorable from this UI, but not erased from kagent either.
    expect(screen.getByText(/cannot be opened again/)).toBeInTheDocument();
    expect(
      screen.getByText(/no way to restore it from here/),
    ).toBeInTheDocument();
    // Opening the dialog does not delete anything.
    expect(deleteSession).not.toHaveBeenCalled();
  });

  it('warns when the deployment does not scope sessions per user', async () => {
    // `unsecure` mode: kagent ignores the forwarded identity and serves one shared
    // user, so the session on screen may be somebody else's. It warns rather than
    // withholding — kagent authorizes the call either way, and the reader is the
    // one who knows whose session this is.
    await renderMenu(false);
    await openDeleteDialog();

    expect(
      await screen.findByText(/may have been started by somebody else/),
    ).toBeInTheDocument();
  });

  it.each([
    ['user-scoped', true],
    ['unresolved', undefined],
  ])('claims nothing when the probe says %s', async (_label, isUserScoped) => {
    await renderMenu(isUserScoped);
    await openDeleteDialog();

    await waitFor(() => {
      expect(screen.getByText(/cannot be opened again/)).toBeInTheDocument();
    });
    expect(
      screen.queryByText(/may have been started by somebody else/),
    ).not.toBeInTheDocument();
  });

  it('confirms, reports and returns to the list on success', async () => {
    await renderMenu();
    await openDeleteDialog();
    await userEvent.click(
      await screen.findByRole('button', { name: 'Delete session' }),
    );

    await waitFor(() => {
      expect(deleteSession).toHaveBeenCalledTimes(1);
    });

    expect(mockToastPost).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'success',
        // Permanent unless a timeout is given, and this is an acknowledgement.
        timeout: expect.any(Number),
      }),
    );
    // Past tense, unlike the agent's "Deleting…": kagent's delete is synchronous,
    // so nothing is still settling by the time this shows.
    expect(mockToastPost.mock.calls[0][0].title).toMatch(
      /Session "What issues are assigned to me\?" deleted/,
    );
    expect(mockNavigate).toHaveBeenCalledWith('/agent-platform/sessions');

    await waitFor(() => {
      expect(
        screen.queryByText('Delete session "What issues are assigned to me?"?'),
      ).not.toBeInTheDocument();
    });
  });

  it('keeps the dialog open and says nothing succeeded when the delete fails', async () => {
    deleteSession.mockRejectedValue(new Error('kagent returned status 500'));
    setDeleteState({ error: new Error('kagent returned status 500') });

    await renderMenu();
    await openDeleteDialog();
    await userEvent.click(
      await screen.findByRole('button', { name: 'Delete session' }),
    );

    await waitFor(() => {
      expect(deleteSession).toHaveBeenCalledTimes(1);
    });

    expect(
      screen.getByText('Delete session "What issues are assigned to me?"?'),
    ).toBeInTheDocument();
    expect(screen.getByText('kagent returned status 500')).toBeInTheDocument();
    expect(mockToastPost).not.toHaveBeenCalled();
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('clears a previous failure when the dialog is reopened', async () => {
    await renderMenu();
    await openDeleteDialog();

    expect(reset).toHaveBeenCalled();
  });

  it('hands the rename back to the page instead of opening a dialog itself', async () => {
    // Rename is the one action whose dialog the menu does not own: the page title
    // opens the same dialog, so the state lives on the page. All this item does is
    // call back.
    await renderMenu();
    await openMenu();
    await userEvent.click(
      screen.getByRole('menuitem', { name: /Rename session/ }),
    );

    expect(onRename).toHaveBeenCalledTimes(1);
    // Nothing destructive is anywhere near it.
    expect(deleteSession).not.toHaveBeenCalled();
  });

  it('keeps the destructive action below the safe one', async () => {
    // Ordering is a safety property, not a style choice: the delete sits under the
    // pointer's resting position if it comes first, and this menu is opened far more
    // often to rename than to delete.
    await renderMenu();
    await openMenu();

    const items = screen.getAllByRole('menuitem').map(item => item.textContent);
    expect(items).toEqual([
      expect.stringMatching(/Rename session/),
      expect.stringMatching(/Delete session/),
    ]);
  });
});
