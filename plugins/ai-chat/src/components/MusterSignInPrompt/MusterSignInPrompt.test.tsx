import { renderInTestApp } from '@backstage/test-utils';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { MusterToolInputRequired } from '@giantswarm/backstage-plugin-gs-common';
import {
  MusterSignInPrompt,
  type MusterSignInPromptProps,
} from './MusterSignInPrompt';

const SIGN_IN_URL = 'https://dex.example.io/auth?state=abc';

const inputRequired: MusterToolInputRequired = {
  tool: 'x_github_get_me',
  arguments: { login: 'me' },
  elicitations: [
    {
      key: 'muster_sign_in',
      url: SIGN_IN_URL,
      message: 'Sign in to github to continue.',
    },
  ],
  requestState: 'opaque',
};

const ran = { content: [{ type: 'text', text: 'octocat' }] };

async function renderPrompt(props: Partial<MusterSignInPromptProps> = {}) {
  const retry = jest.fn().mockResolvedValue(ran);
  const onResult = jest.fn();
  await renderInTestApp(
    <MusterSignInPrompt
      inputRequired={inputRequired}
      retry={retry}
      onResult={onResult}
      isActive
      {...props}
    />,
  );
  return { retry, onResult };
}

describe('MusterSignInPrompt', () => {
  it('names the server, the destination host and the full https address as a link', async () => {
    await renderPrompt();

    expect(
      screen.getByRole('heading', { name: 'Sign in to github to continue' }),
    ).toBeInTheDocument();
    expect(screen.getByText('dex.example.io')).toBeInTheDocument();
    const link = screen.getByRole('link', {
      name: name => name.includes(SIGN_IN_URL),
    });
    expect(link).toHaveAttribute('href', SIGN_IN_URL);
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it('names the server muster puts in front of a message it passes on', async () => {
    await renderPrompt({
      inputRequired: {
        ...inputRequired,
        tool: 'call_tool',
        elicitations: [
          {
            key: 'k',
            url: SIGN_IN_URL,
            message: '[jira] Connect your Jira account.',
          },
        ],
      },
    });

    expect(
      screen.getByRole('heading', { name: 'Sign in to jira to continue' }),
    ).toBeInTheDocument();
    expect(
      screen.getByText('“Connect your Jira account.”'),
    ).toBeInTheDocument();
  });

  it('sends the call again with accept and the echoed requestState once the person has signed in', async () => {
    const { retry, onResult } = await renderPrompt();

    await userEvent.click(
      screen.getByRole('link', { name: /Open sign-in page/ }),
    );
    await userEvent.click(
      screen.getByRole('button', { name: "I've signed in" }),
    );

    await waitFor(() => expect(onResult).toHaveBeenCalledWith(ran));
    expect(retry).toHaveBeenCalledWith(inputRequired, {
      inputResponses: { muster_sign_in: { action: 'accept' } },
      requestState: 'opaque',
    });
  });

  it('asks again when muster asks again after an accept', async () => {
    const { retry, onResult } = await renderPrompt();
    retry.mockResolvedValueOnce({
      content: [],
      isError: true,
      inputRequired: { ...inputRequired, requestState: 'second' },
    });

    await userEvent.click(
      screen.getByRole('link', { name: /Open sign-in page/ }),
    );
    await userEvent.click(
      screen.getByRole('button', { name: "I've signed in" }),
    );

    expect(
      await screen.findByText(/The sign-in has not finished yet/),
    ).toBeInTheDocument();
    expect(onResult).not.toHaveBeenCalled();

    await userEvent.click(
      screen.getByRole('button', { name: "I've signed in" }),
    );

    await waitFor(() => expect(onResult).toHaveBeenCalledWith(ran));
    expect(retry).toHaveBeenLastCalledWith(
      { ...inputRequired, requestState: 'second' },
      {
        inputResponses: { muster_sign_in: { action: 'accept' } },
        requestState: 'second',
      },
    );
  });

  it.each([
    ["Don't sign in", 'decline'],
    ['Cancel', 'cancel'],
  ])(
    'answers %s with %s and hands the result to the model',
    async (label, action) => {
      const declined = {
        content: [{ type: 'text', text: 'The tool did not run.' }],
        isError: true,
      };
      const { retry, onResult } = await renderPrompt();
      retry.mockResolvedValueOnce(declined);

      await userEvent.click(screen.getByRole('button', { name: label }));

      await waitFor(() => expect(onResult).toHaveBeenCalledWith(declined));
      expect(retry).toHaveBeenCalledWith(inputRequired, {
        inputResponses: { muster_sign_in: { action } },
        requestState: 'opaque',
      });
    },
  );

  it('tells the model the person declined when the answer could not be sent', async () => {
    const { retry, onResult } = await renderPrompt();
    retry.mockRejectedValueOnce(new Error('offline'));

    await userEvent.click(
      screen.getByRole('button', { name: "Don't sign in" }),
    );

    await waitFor(() =>
      expect(onResult).toHaveBeenCalledWith({
        content: [
          {
            type: 'text',
            text: 'The tool did not run: the person answered decline to signing in.',
          },
        ],
        isError: true,
      }),
    );
  });

  it('shows a failed accept and lets the person try again', async () => {
    const { retry, onResult } = await renderPrompt();
    retry.mockRejectedValueOnce(new Error('Bad gateway'));

    await userEvent.click(
      screen.getByRole('link', { name: /Open sign-in page/ }),
    );
    await userEvent.click(
      screen.getByRole('button', { name: "I've signed in" }),
    );

    expect(
      await screen.findByText(/could not be sent again: Bad gateway/),
    ).toBeInTheDocument();
    expect(onResult).not.toHaveBeenCalled();
    expect(
      screen.getByRole('button', { name: "I've signed in" }),
    ).toBeEnabled();
  });

  it.each([
    ['plain http', 'http://dex.example.io/auth', /not a secure \(https\)/],
    ['a non-web scheme', 'ftp://dex.example.io/auth', /not a secure \(https\)/],
    [
      'a user name before the host',
      'https://github.com@evil.example/auth',
      /user name before the host/,
    ],
  ])('renders no link for %s', async (_, url, refusal) => {
    await renderPrompt({
      inputRequired: {
        ...inputRequired,
        elicitations: [{ ...inputRequired.elicitations[0], url }],
      },
    });

    expect(screen.getByText(refusal)).toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: "I've signed in" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: "Don't sign in" }),
    ).toBeInTheDocument();
  });

  it('offers no answer on an older message, whose output no longer reaches the model', async () => {
    await renderPrompt({ isActive: false });

    expect(
      screen.getByText('Not answered, so the tool did not run.'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});
