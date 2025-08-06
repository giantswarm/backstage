import { ScrollContainer } from '../../ScrollContainer';
import { StatusMessage } from '../../StatusMessage';

type ConditionMessageProps = {
  message: string;
};

export const ConditionMessage = ({ message }: ConditionMessageProps) => {
  return (
    <ScrollContainer>
      <StatusMessage>
        <code>{message}</code>
      </StatusMessage>
    </ScrollContainer>
  );
};
