import { renderInTestApp } from '@backstage/frontend-test-utils';
import { screen } from '@testing-library/react';
import {
  AgentPlatformCookieAuth,
  resetAgentPlatformCookieMemory,
} from './AgentPlatformCookieAuth';

type CookieResult =
  | { status: 'loading' }
  | { status: 'error'; error: Error; retry: () => void }
  | { status: 'success'; data: { expiresAt: string } };

let mockResult: CookieResult = { status: 'loading' };
jest.mock('@backstage/plugin-auth-react', () => ({
  useCookieAuthRefresh: () => mockResult,
}));

const inAnHour = () => new Date(Date.now() + 3_600_000).toISOString();

function renderTab() {
  return renderInTestApp(
    <AgentPlatformCookieAuth>
      <p>the tab</p>
    </AgentPlatformCookieAuth>,
  );
}

beforeEach(() => {
  resetAgentPlatformCookieMemory();
  mockResult = { status: 'loading' };
});

describe('AgentPlatformCookieAuth', () => {
  it('holds the tab back until the first cookie is issued', async () => {
    await renderTab();

    expect(screen.queryByText('the tab')).toBeNull();
  });

  it('renders the tab once the cookie is there', async () => {
    mockResult = { status: 'success', data: { expiresAt: inAnHour() } };

    await renderTab();

    expect(screen.getByText('the tab')).toBeInTheDocument();
  });

  it('does not wait again for a cookie issued earlier in this page load', async () => {
    mockResult = { status: 'success', data: { expiresAt: inAnHour() } };
    const first = await renderTab();
    first.unmount();

    // The next mount re-reads the cookie, and the tab renders meanwhile.
    mockResult = { status: 'loading' };
    await renderTab();

    expect(screen.getByText('the tab')).toBeInTheDocument();
  });

  it('waits again for a cookie about to expire', async () => {
    mockResult = {
      status: 'success',
      data: { expiresAt: new Date(Date.now() + 30_000).toISOString() },
    };
    const first = await renderTab();
    first.unmount();

    mockResult = { status: 'loading' };
    await renderTab();

    expect(screen.queryByText('the tab')).toBeNull();
  });

  it('says so when the cookie cannot be issued', async () => {
    mockResult = {
      status: 'error',
      error: new Error('backend down'),
      retry: jest.fn(),
    };

    await renderTab();

    expect(screen.queryByText('the tab')).toBeNull();
    expect(
      screen.getByRole('button', { name: /backend down/ }),
    ).toBeInTheDocument();
  });
});
