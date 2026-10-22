import { Alert, Button } from '@backstage/ui';
import { McpAuthDialog } from '@giantswarm/backstage-plugin-muster';

import { CHATGPT_PROVIDER_APP } from '../../hooks/useChatGptConnection';

export type ChatGptConnectPromptProps = {
  /** A message held until the person connects, which then goes on its own. */
  hasHeldMessage?: boolean;
  /** Opens {@link ChatGptConnectDialog}, which the page keeps mounted. */
  onConnect: () => void;
};

export type ChatGptConnectDialogProps = {
  /** The installation whose muster keeps the person's ChatGPT login. */
  installation: string;
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
};

/**
 * The sign-in dialog on the ChatGPT row only. Kept by the page rather than the
 * prompt, so it stays open, reading *Connected*, after the prompt has gone.
 */
export function ChatGptConnectDialog({
  installation,
  isOpen,
  onOpenChange,
}: ChatGptConnectDialogProps) {
  if (!isOpen) {
    return null;
  }
  return (
    <McpAuthDialog
      isOpen
      onOpenChange={onOpenChange}
      installation={installation}
      servers={[]}
      apps={[CHATGPT_PROVIDER_APP]}
    />
  );
}

/** What the composer says while the person has not connected ChatGPT. */
export const CHATGPT_CONNECT_REASON =
  'Connect your ChatGPT subscription to talk to this agent.';

/**
 * The prompt the agent chat shows in place of sending a turn, for an agent
 * whose model is the person's own ChatGPT subscription while the person has
 * not connected it: *Connect* opens the sign-in dialog on the ChatGPT row.
 * The prompt goes once muster reports the person connected.
 */
export function ChatGptConnectPrompt({
  hasHeldMessage,
  onConnect,
}: ChatGptConnectPromptProps) {
  return (
    <Alert
      status="warning"
      data-testid="chatgpt-connect-prompt"
      title={CHATGPT_CONNECT_REASON}
      description={
        hasHeldMessage
          ? 'This agent runs on your own ChatGPT subscription. Your message is sent as soon as you have connected it.'
          : 'This agent runs on your own ChatGPT subscription. You connect it once, and every agent of yours on it can use it.'
      }
      customActions={
        <Button size="small" variant="primary" onPress={onConnect}>
          Connect
        </Button>
      }
    />
  );
}
