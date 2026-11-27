import {
  type ToolCallMessagePartComponent,
  type ToolCallMessagePartProps,
  useAuiState,
} from '@assistant-ui/react';
import { toolInputRequiredOf } from '@giantswarm/backstage-plugin-gs-common';
import { useMusterRetry } from '../../hooks/useMusterRetry';
import { MusterUrlElicitationPrompt } from '../MusterUrlElicitationPrompt';

/**
 * A tool call's URL elicitation prompt, or its supplied fallback renderer.
 */
export function MusterUrlElicitationToolCall({
  Fallback,
  ...props
}: ToolCallMessagePartProps & { Fallback?: ToolCallMessagePartComponent }) {
  const isLast = useAuiState(({ message }) => message.isLast);
  const retry = useMusterRetry();
  const inputRequired = toolInputRequiredOf(props.result);

  if (inputRequired) {
    return (
      <MusterUrlElicitationPrompt
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
