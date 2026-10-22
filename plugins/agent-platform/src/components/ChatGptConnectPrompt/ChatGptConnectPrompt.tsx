import { useState } from 'react';
import { Alert, Button } from '@backstage/ui';
import { McpAuthDialog } from '@giantswarm/backstage-plugin-muster';

import { CHATGPT_PROVIDER_APP } from '../../hooks/useChatGptConnection';

export type ChatGptConnectPromptProps = {
  /** The installation whose muster keeps the person's ChatGPT login. */
  installation: string;
  /** A message held until the person connects, which then goes on its own. */
  hasHeldMessage?: boolean;
};

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
  installation,
  hasHeldMessage,
}: ChatGptConnectPromptProps) {
  const [isOpen, setOpen] = useState(false);
  return (
    <>
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
          <Button size="small" variant="primary" onPress={() => setOpen(true)}>
            Connect
          </Button>
        }
      />
      {isOpen && (
        <McpAuthDialog
          isOpen
          onOpenChange={setOpen}
          installation={installation}
          servers={[]}
          apps={[CHATGPT_PROVIDER_APP]}
        />
      )}
    </>
  );
}
