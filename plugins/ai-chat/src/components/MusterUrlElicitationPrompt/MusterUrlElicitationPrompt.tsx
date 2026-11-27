import { useEffect, useRef, useState } from 'react';
import { Alert, Box, Button, Flex, Text } from '@backstage/ui';
import {
  type MusterElicitationAction,
  type MusterInputAnswer,
  type MusterToolInputRequired,
  type MusterUrlElicitation,
  musterServerOfTool,
  toolInputRequiredOf,
} from '@giantswarm/backstage-plugin-gs-common';
import {
  describeExternalUrl,
  externalUrlWarningText,
  ExternalButtonLink,
  ExternalLink,
} from '@giantswarm/backstage-plugin-ui-react';

/** muster's mark of a message it passes on from one of its servers. */
const SERVER_PREFIX = /^\[([^\]]+)\]\s*/;

type DescribedElicitation = {
  key: string;
  server: string;
  message: string;
  url: string;
  /** Set when the address may be opened: https, no user name before the host. */
  href?: string;
  hostname?: string;
  refusal?: string;
  warning?: string;
};

/**
 * The server an elicitation comes from -- the one muster names in front of
 * a message it passes on, or the server of the called tool -- and the
 * address, opened only when it is an https page without a user name.
 */
function describeElicitation(
  elicitation: MusterUrlElicitation,
  tool: string,
): DescribedElicitation {
  const prefix = SERVER_PREFIX.exec(elicitation.message);
  const server = prefix?.[1] ?? musterServerOfTool(tool) ?? 'muster';
  const message = prefix
    ? elicitation.message.slice(prefix[0].length)
    : elicitation.message;
  const described = describeExternalUrl(elicitation.url);
  const base = { key: elicitation.key, server, message, url: elicitation.url };
  if (!described || !described.href.startsWith('https:')) {
    return {
      ...base,
      refusal: `${server} sent an address that is not a secure (https) web page, so it is not opened from here.`,
    };
  }
  if (described.warnings.includes('userinfo')) {
    return {
      ...base,
      refusal: `${server} sent an address with a user name before the host, which can disguise where it leads, so it is not opened from here.`,
    };
  }
  return {
    ...base,
    href: described.href,
    hostname: described.hostname,
    warning: described.warnings.includes('punycode')
      ? externalUrlWarningText('punycode', described.domain)
      : undefined,
  };
}

function answerOf(
  inputRequired: MusterToolInputRequired,
  action: MusterElicitationAction,
): MusterInputAnswer {
  return {
    inputResponses: Object.fromEntries(
      inputRequired.elicitations.map(({ key }) => [key, { action }]),
    ),
    ...(inputRequired.requestState !== undefined
      ? { requestState: inputRequired.requestState }
      : {}),
  };
}

/** What the model reads when an answer to decline or cancel got no reply. */
function refusedOutput(action: MusterElicitationAction) {
  return {
    content: [
      {
        type: 'text',
        text: `The person answered ${action} to the URL elicitation. Do not retry this tool call.`,
      },
    ],
    isError: true,
  };
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export type MusterUrlElicitationPromptProps = {
  /** muster's ask, as the chat backend handed it as the call's output. */
  inputRequired: MusterToolInputRequired;
  /** Sends the call again with the person's answer; resolves to its output. */
  retry: (
    inputRequired: MusterToolInputRequired,
    input: MusterInputAnswer,
    signal?: AbortSignal,
  ) => Promise<unknown>;
  /** The call's output for the model, once muster no longer asks. */
  onResult: (output: unknown) => void;
  /**
   * The call belongs to the latest answer of the chat, the only one whose
   * output still reaches the model; an older one is shown as unanswered.
   */
  isActive: boolean;
};

/** A URL elicitation and the person's answer, with cancellation of pending retries. */
export function MusterUrlElicitationPrompt({
  inputRequired: initial,
  retry,
  onResult,
  isActive,
}: MusterUrlElicitationPromptProps) {
  const [inputRequired, setInputRequired] = useState(initial);
  const [opened, setOpened] = useState(false);
  const [askedAgain, setAskedAgain] = useState(false);
  const [pending, setPending] = useState<MusterElicitationAction>();
  const [error, setError] = useState<string>();
  const controller = useRef<AbortController>();

  useEffect(() => {
    if (!isActive) controller.current?.abort();
    return () => {
      controller.current?.abort();
      controller.current = undefined;
    };
  }, [isActive]);

  const elicitations = inputRequired.elicitations.map(elicitation =>
    describeElicitation(elicitation, inputRequired.tool),
  );
  const servers = [...new Set(elicitations.map(({ server }) => server))];
  const openable = elicitations.every(({ href }) => href !== undefined);
  const single = elicitations.length === 1 ? elicitations[0] : undefined;

  const answer = async (action: MusterElicitationAction) => {
    const requestController = new AbortController();
    controller.current = requestController;
    setPending(action);
    setError(undefined);
    try {
      const output = await retry(
        inputRequired,
        answerOf(inputRequired, action),
        requestController.signal,
      );
      if (requestController.signal.aborted) return;
      const again = toolInputRequiredOf(output);
      if (again) {
        const sameUrls =
          again.elicitations.map(({ url }) => url).join('\n') ===
          inputRequired.elicitations.map(({ url }) => url).join('\n');
        setInputRequired(again);
        setOpened(current => current && sameUrls);
        setAskedAgain(true);
        setPending(undefined);
        return;
      }
      onResult(output);
    } catch (e) {
      if (requestController.signal.aborted) return;
      if (action !== 'accept') {
        onResult(refusedOutput(action));
        return;
      }
      setError(messageOf(e));
      setPending(undefined);
    } finally {
      if (controller.current === requestController) {
        controller.current = undefined;
      }
    }
  };

  const stopWaiting = () => {
    controller.current?.abort();
    controller.current = undefined;
    onResult({
      content: [
        {
          type: 'text',
          text: 'Waiting was cancelled. The tool may already have run. Check its outcome before retrying; do not retry automatically.',
        },
      ],
      isError: true,
    });
  };

  const busy = pending !== undefined;

  return (
    <Box
      p="3"
      mt="2"
      mb="2"
      style={{
        border: '1px solid var(--bui-border-1)',
        borderRadius: 'var(--bui-radius-3)',
        backgroundColor: 'var(--bui-bg-neutral-1)',
      }}
      data-testid="muster-url-elicitation-prompt"
    >
      <Flex direction="column" gap="3">
        <Text as="h3" variant="title-x-small">
          {servers.join(', ')} asks you to open a page
        </Text>
        {elicitations.map(elicitation => (
          <Flex key={elicitation.key} direction="column" gap="2">
            {elicitation.message ? (
              <Text variant="body-medium" color="secondary">
                “{elicitation.message}”
              </Text>
            ) : null}
            {elicitation.href ? (
              <>
                {elicitation.warning ? (
                  <Alert
                    status="warning"
                    icon
                    description={elicitation.warning}
                  />
                ) : null}
                <Text variant="body-medium">
                  Destination:{' '}
                  <Text as="span" variant="body-medium" weight="bold">
                    {elicitation.hostname}
                  </Text>
                </Text>
                <Text
                  variant="body-medium"
                  style={{ overflowWrap: 'anywhere' }}
                >
                  <ExternalLink
                    href={elicitation.href}
                    display="inline"
                    onClick={() => setOpened(true)}
                  >
                    <span>{elicitation.href}</span>
                  </ExternalLink>
                </Text>
              </>
            ) : (
              <>
                <Alert status="danger" icon description={elicitation.refusal} />
                <Text
                  variant="body-small"
                  color="secondary"
                  style={{ overflowWrap: 'anywhere' }}
                >
                  {elicitation.url}
                </Text>
              </>
            )}
          </Flex>
        ))}
        {isActive ? (
          <>
            <div role="status" aria-live="polite">
              {pending === 'accept' ? (
                <Alert
                  status="info"
                  isPending
                  description="Waiting for the tool to continue…"
                />
              ) : null}
              {!busy && askedAgain ? (
                <Alert
                  status="warning"
                  icon
                  description="The server still needs this interaction. Finish on the external page, then select Continue again."
                />
              ) : null}
              {!busy && !askedAgain && opened ? (
                <Text variant="body-medium">
                  Finish on the page that opened, then select Continue.
                </Text>
              ) : null}
            </div>
            {error ? (
              <Alert
                status="danger"
                icon
                role="alert"
                description={`The call could not be sent again: ${error}. Try again.`}
              />
            ) : null}
            <Flex gap="2" style={{ flexWrap: 'wrap' }}>
              {openable && opened ? (
                <Button
                  variant="primary"
                  style={{ minWidth: 136 }}
                  isDisabled={busy}
                  onPress={() => answer('accept')}
                >
                  Continue
                </Button>
              ) : null}
              {openable && !opened && single?.href ? (
                <ExternalButtonLink
                  variant="primary"
                  style={{ minWidth: 136 }}
                  href={single.href}
                  isDisabled={busy}
                  onPress={() => setOpened(true)}
                >
                  Open page
                </ExternalButtonLink>
              ) : null}
              <Button
                variant="secondary"
                isDisabled={busy}
                onPress={() => answer('decline')}
              >
                Decline
              </Button>
              <Button
                variant="tertiary"
                onPress={() => (busy ? stopWaiting() : answer('cancel'))}
              >
                {busy ? 'Stop waiting' : 'Cancel'}
              </Button>
            </Flex>
          </>
        ) : (
          <Text variant="body-medium" color="secondary">
            This request is no longer active.
          </Text>
        )}
      </Flex>
    </Box>
  );
}
