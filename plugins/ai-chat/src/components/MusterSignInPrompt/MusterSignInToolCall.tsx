import {
  type ToolCallMessagePartComponent,
  type ToolCallMessagePartProps,
  useAuiState,
} from '@assistant-ui/react';
import { toolInputRequiredOf } from '@giantswarm/backstage-plugin-gs-common';
import { useMusterRetry } from '../../hooks/useMusterRetry';
import { MusterSignInPrompt } from './MusterSignInPrompt';

/**
 * A tool call of the chat: the sign-in prompt while muster waits for the
 * person to sign in before the tool runs, `Fallback` (nothing without one)
 * otherwise.
 */
export function MusterSignInToolCall({
  Fallback,
  ...props
}: ToolCallMessagePartProps & { Fallback?: ToolCallMessagePartComponent }) {
  const isLast = useAuiState(({ message }) => message.isLast);
  const retry = useMusterRetry();
  const inputRequired = toolInputRequiredOf(props.result);

  if (inputRequired) {
    return (
      <MusterSignInPrompt
        key={props.toolCallId}
        inputRequired={inputRequired}
        retry={retry}
        onResult={props.addResult}
        isActive={isLast}
      />
    );
  }
  return Fallback ? <Fallback {...props} /> : null;
}
