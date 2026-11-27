import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Flex, Text, TextField } from '@backstage/ui';
import { useTrackedMutation } from '@giantswarm/backstage-plugin-analytics-react';
import {
  ServerSignIn,
  useConnectorLabel,
  useMusterServerAvailability,
} from '@giantswarm/backstage-plugin-muster';
import {
  ConfirmDialog,
  ExternalLink,
  TextAreaField,
  useFieldValidation,
} from '@giantswarm/backstage-plugin-ui-react';

import { SlackClient, SlackNotConnectedError } from '../../apis/SlackClient';
import { useMusterPluginApi } from '../../hooks/useReviewsClient';
import type { PrRow, PrState } from '../../lib/github';
import {
  channelNameOf,
  channelProblem,
  slackPostMessage,
  SLACK_SERVER,
} from '../../lib/slack';

export type SlackPostDialogProps = {
  installation: string;
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  /** The ticked PRs, in the order the section shows them. */
  rows: PrRow[];
  /** Their state, as the section read it; a PR without one says no state. */
  states: ReadonlyMap<string, PrState | undefined>;
  /** The channel the dialog opens with, from the team in view. */
  defaultChannel: string;
  /** Called once Slack took the message. */
  onSent?: () => void;
};

/**
 * "Post to Slack": one message about the ticked PRs, posted to a channel as
 * the person through muster's `slack` server. The channel and the message are
 * pre-filled and editable; nothing is sent until Send.
 */
export function SlackPostDialog({
  installation,
  isOpen,
  onOpenChange,
  rows,
  states,
  defaultChannel,
  onSent,
}: SlackPostDialogProps) {
  const musterApi = useMusterPluginApi();
  const client = useMemo(
    () => (musterApi ? new SlackClient(musterApi, installation) : undefined),
    [musterApi, installation],
  );
  const [channel, setChannel] = useState(defaultChannel);
  const [message, setMessage] = useState('');
  // The dialog renders in a portal: its fields are checked within `scope`.
  const scope = useRef<HTMLDivElement>(null);
  const { textFieldProps, fieldProps, reveal } = useFieldValidation(scope, {
    isOpen,
  });

  const send = useTrackedMutation({
    event: null,
    untrackedReason:
      "Internal review tooling of Giant Swarm's own portal, not a customer portal action.",
    mutationFn: async (input: { channel: string; message: string }) => {
      if (!client) {
        throw new Error('This portal has no muster to reach Slack through.');
      }
      return client.send(input.channel, input.message);
    },
    onSuccess: () => onSent?.(),
  });

  // A fresh dialog each time it opens: the channel of the team in view and
  // the message for the PRs ticked now.
  useEffect(() => {
    if (isOpen) {
      setChannel(defaultChannel);
      setMessage(slackPostMessage(rows, states));
      send.reset();
    }
    // Only on opening: what the person types stays while it is open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  const channelError = channelProblem(channel);
  const messageError =
    message.trim() === '' ? 'Write the message to send.' : undefined;
  const notConnected = send.error instanceof SlackNotConnectedError;

  const onConfirm = () => {
    if (channelError || messageError) {
      reveal();
      return;
    }
    send.mutate({ channel, message: message.trim() });
  };

  const sentTo = `#${channelNameOf(channel)}`;
  return (
    <ConfirmDialog
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      title="Post to Slack"
      confirmLabel="Send"
      busyLabel="Sending…"
      isBusy={send.isPending}
      isDone={send.isSuccess}
      error={
        send.error && !notConnected ? (
          <>Slack did not take the message: {send.error.message}</>
        ) : undefined
      }
      onConfirm={onConfirm}
      width={560}
    >
      {notConnected && (
        <ConnectSlackAlert installation={installation} error={send.error!} />
      )}
      {send.isSuccess ? (
        <Alert
          status="success"
          title={`Posted to ${sentTo}`}
          description={
            send.data?.post ? (
              <Text variant="body-small">
                <ExternalLink href={send.data.post.url} display="inline">
                  Open the message in Slack
                </ExternalLink>
              </Text>
            ) : (
              'Slack took the message.'
            )
          }
        />
      ) : (
        <div ref={scope}>
          <Flex direction="column" gap="3">
            <Text variant="body-small" color="secondary">
              Posts one message about{' '}
              {rows.length === 1 ? 'this PR' : 'these PRs'} to the channel, as
              you, with your own Slack grant. Nobody is mentioned unless you add
              a mention.
            </Text>
            <TextField
              label="Channel"
              isRequired
              description="The channel's name, like #team-shield, or its ID."
              value={channel}
              onChange={setChannel}
              {...textFieldProps('channel', channelError)}
            />
            <TextAreaField
              label="Message"
              secondaryLabel="Required"
              description="Markdown, as Slack shows it: links, bold and lists."
              rows={Math.min(12, rows.length * 2 + 2)}
              value={message}
              onChange={setMessage}
              {...fieldProps('message', messageError)}
            />
          </Flex>
        </div>
      )}
    </ConfirmDialog>
  );
}

/** The person declined, or has not given, muster their Slack grant. */
function ConnectSlackAlert({
  installation,
  error,
}: {
  installation: string;
  error: Error;
}) {
  const availability = useMusterServerAvailability(SLACK_SERVER, [
    installation,
  ]);
  const serverName =
    availability.registeredNameOf(installation) ?? SLACK_SERVER;
  const label = useConnectorLabel(installation, serverName);
  return (
    <Alert
      status="warning"
      title={`Connect ${label} to post as you`}
      description={
        <Flex direction="column" gap="2">
          <Text variant="body-small">
            The message is posted with your own Slack grant, which muster does
            not hold yet on {installation}. Connect, then Send again: your
            message is kept.
          </Text>
          <Text variant="body-small" color="secondary">
            {error.message}
          </Text>
          <ServerSignIn
            noun="connector"
            serverName={serverName}
            displayName={label}
            installation={installation}
          />
        </Flex>
      }
    />
  );
}
