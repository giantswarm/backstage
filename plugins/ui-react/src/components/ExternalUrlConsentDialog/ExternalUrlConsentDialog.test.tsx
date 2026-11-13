import { TestApiProvider, renderInTestApp } from '@backstage/test-utils';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  ExternalUrlConsentManager,
  externalUrlConsentApiRef,
} from '../../apis/externalUrlConsent';
import { ExternalUrlConsentDialogHost } from './ExternalUrlConsentDialog';

async function renderHost() {
  const openUrl = jest.fn();
  const manager = new ExternalUrlConsentManager(openUrl);
  await renderInTestApp(
    <TestApiProvider apis={[[externalUrlConsentApiRef, manager]]}>
      <ExternalUrlConsentDialogHost />
    </TestApiProvider>,
  );
  return { manager, openUrl };
}

describe('ExternalUrlConsentDialogHost', () => {
  it('shows the full address with the domain highlighted, as text', async () => {
    const { manager, openUrl } = await renderHost();

    const answered = manager.open({
      url: 'https://login.github.com.evil.example/oauth?state=abc',
      requester: 'GitHub',
      message: 'Sign in to GitHub to continue.',
    });

    const address = await screen.findByTestId('external-url');
    expect(address).toHaveTextContent(
      'https://login.github.com.evil.example/oauth?state=abc',
    );
    expect(address.querySelector('mark')).toHaveTextContent('evil.example');
    expect(screen.getByRole('dialog')).toHaveTextContent(
      'Sign in to GitHub to continue.',
    );
    expect(screen.getByRole('dialog').querySelector('a')).toBeNull();

    await userEvent.click(
      screen.getByRole('button', { name: 'Open page in new tab' }),
    );

    await expect(answered).resolves.toBe('accept');
    expect(openUrl).toHaveBeenCalledWith(
      'https://login.github.com.evil.example/oauth?state=abc',
      'tab',
    );
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('warns about a punycode domain', async () => {
    const { manager } = await renderHost();

    manager.open({ url: 'https://аpple.com/', requester: 'miro' });

    expect(await screen.findByTestId('external-url')).toHaveTextContent(
      'https://xn--pple-43d.com/',
    );
    expect(screen.getByText(/punycode form/)).toBeInTheDocument();
  });

  it("answers decline for Don't open page, and opens nothing", async () => {
    const { manager, openUrl } = await renderHost();

    const answered = manager.open({
      url: 'https://example.com',
      requester: 'miro',
    });
    await userEvent.click(
      await screen.findByRole('button', { name: "Don't open page" }),
    );

    await expect(answered).resolves.toBe('decline');
    expect(openUrl).not.toHaveBeenCalled();
  });

  it('answers cancel for Escape', async () => {
    const { manager, openUrl } = await renderHost();

    const answered = manager.open({
      url: 'https://example.com',
      requester: 'miro',
    });
    await screen.findByRole('dialog');
    await userEvent.keyboard('{Escape}');

    await expect(answered).resolves.toBe('cancel');
    expect(openUrl).not.toHaveBeenCalled();
  });

  it('offers no way to open an address that is no web page', async () => {
    const { manager } = await renderHost();

    // eslint-disable-next-line no-script-url
    manager.open({ url: 'javascript:alert(1)', requester: 'miro' });

    expect(await screen.findByText(/not a web page/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Open/ })).toBeNull();
  });
});
