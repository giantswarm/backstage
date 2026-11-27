import { renderInTestApp } from '@backstage/test-utils';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { MusterToolInputRequired } from '@giantswarm/backstage-plugin-gs-common';
import {
  MusterUrlElicitationPrompt,
  type MusterUrlElicitationPromptProps,
} from './MusterUrlElicitationPrompt';

const SIGN_IN_URL = 'https://dex.example.io/auth?state=abc';

const inputRequired: MusterToolInputRequired = {
  tool: 'x_github_get_me',
  arguments: { login: 'me' },
  elicitations: [
    {
      key: 'muster_sign_in',
      url: SIGN_IN_URL,
      message: 'github asks you to open a page.',
    },
  ],
  requestState: 'opaque',
};

const ran = { content: [{ type: 'text', text: 'octocat' }] };

async function renderPrompt(
  props: Partial<MusterUrlElicitationPromptProps> = {},
) {
  const retry = jest.fn().mockResolvedValue(ran);
  const onResult = jest.fn();
  await renderInTestApp(
    <MusterUrlElicitationPrompt
      inputRequired={inputRequired}
      retry={retry}
      onResult={onResult}
      isActive
      {...props}
    />,
  );
  return { retry, onResult };
}

describe('MusterUrlElicitationPrompt', () => {
  it('warns about punycode destinations', async () => {
    await renderPrompt({
      inputRequired: {
        ...inputRequired,
        elicitations: [
          {
            key: 'payment',
            message: 'Approve payment',
            url: 'https://xn--pple-43d.example/pay',
          },
        ],
      },
    });
    expect(screen.getByText(/shown in its punycode form/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Open page/ })).toBeInTheDocument();
    expect(screen.queryByText(/I've signed in/)).not.toBeInTheDocument();
  });

  it('stops a pending retry without claiming its effects were undone', async () => {
    const retry = jest.fn().mockImplementation(
      (_required, _input, signal: AbortSignal) =>
        new Promise((_resolve, reject) => {
          signal.addEventListener('abort', () =>
            reject(new DOMException('Stopped', 'AbortError')),
          );
        }),
    );
    const onResult = jest.fn();
    await renderPrompt({ retry, onResult });
    await userEvent.click(screen.getByRole('link', { name: /Open page/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Continue' }));
    expect(screen.getByRole('button', { name: 'Continue' })).toBeDisabled();
    await userEvent.click(screen.getByRole('button', { name: 'Stop waiting' }));
    expect(retry.mock.calls[0][2].aborted).toBe(true);
    expect(onResult).toHaveBeenCalledTimes(1);
    expect(onResult.mock.calls[0][0].content[0].text).toContain(
      'may already have run',
    );
  });

  it('aborts the retry when the prompt unmounts and ignores late results', async () => {
    let resolveRetry: (output: unknown) => void = () => {};
    const retry = jest.fn().mockImplementation(
      () =>
        new Promise(resolve => {
          resolveRetry = resolve;
        }),
    );
    const onResult = jest.fn();
    const { unmount } = await renderInTestApp(
      <MusterUrlElicitationPrompt
        inputRequired={inputRequired}
        retry={retry}
        onResult={onResult}
        isActive
      />,
    );
    await userEvent.click(screen.getByRole('link', { name: /Open page/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Continue' }));
    unmount();
    expect(retry.mock.calls[0][2].aborted).toBe(true);
    resolveRetry(ran);
    await waitFor(() => expect(onResult).not.toHaveBeenCalled());
  });

  it('names the server, the destination host and the full https address as a link', async () => {
    await renderPrompt();

    expect(
      screen.getByRole('heading', { name: 'github asks you to open a page' }),
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
      screen.getByRole('heading', { name: 'jira asks you to open a page' }),
    ).toBeInTheDocument();
    expect(
      screen.getByText('“Connect your Jira account.”'),
    ).toBeInTheDocument();
  });

  it('sends the call again with accept and the echoed requestState once the person has signed in', async () => {
    const { retry, onResult } = await renderPrompt();

    await userEvent.click(screen.getByRole('link', { name: /Open page/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Continue' }));

    await waitFor(() => expect(onResult).toHaveBeenCalledWith(ran));
    expect(retry).toHaveBeenCalledWith(
      inputRequired,
      {
        inputResponses: { muster_sign_in: { action: 'accept' } },
        requestState: 'opaque',
      },
      expect.any(AbortSignal),
    );
  });

  it('asks again when muster asks again after an accept', async () => {
    const { retry, onResult } = await renderPrompt();
    retry.mockResolvedValueOnce({
      content: [],
      isError: true,
      inputRequired: { ...inputRequired, requestState: 'second' },
    });

    await userEvent.click(screen.getByRole('link', { name: /Open page/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Continue' }));

    expect(
      await screen.findByText(/The server still needs this interaction/),
    ).toBeInTheDocument();
    expect(onResult).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole('button', { name: 'Continue' }));

    await waitFor(() => expect(onResult).toHaveBeenCalledWith(ran));
    expect(retry).toHaveBeenLastCalledWith(
      { ...inputRequired, requestState: 'second' },
      {
        inputResponses: { muster_sign_in: { action: 'accept' } },
        requestState: 'second',
      },
      expect.any(AbortSignal),
    );
  });

  it.each([
    ['Decline', 'decline'],
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
      expect(retry).toHaveBeenCalledWith(
        inputRequired,
        {
          inputResponses: { muster_sign_in: { action } },
          requestState: 'opaque',
        },
        expect.any(AbortSignal),
      );
    },
  );

  it('tells the model the person declined when the answer could not be sent', async () => {
    const { retry, onResult } = await renderPrompt();
    retry.mockRejectedValueOnce(new Error('offline'));

    await userEvent.click(screen.getByRole('button', { name: 'Decline' }));

    await waitFor(() =>
      expect(onResult).toHaveBeenCalledWith({
        content: [
          {
            type: 'text',
            text: 'The person answered decline to the URL elicitation. Do not retry this tool call.',
          },
        ],
        isError: true,
      }),
    );
  });

  it('shows a failed accept and lets the person try again', async () => {
    const { retry, onResult } = await renderPrompt();
    retry.mockRejectedValueOnce(new Error('Bad gateway'));

    await userEvent.click(screen.getByRole('link', { name: /Open page/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Continue' }));

    expect(
      await screen.findByText(/could not be sent again: Bad gateway/),
    ).toBeInTheDocument();
    expect(onResult).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Continue' })).toBeEnabled();
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
      screen.queryByRole('button', { name: 'Continue' }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Decline' })).toBeInTheDocument();
  });

  it('offers no answer on an older message, whose output no longer reaches the model', async () => {
    await renderPrompt({ isActive: false });

    expect(
      screen.getByText('This request is no longer active.'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});
