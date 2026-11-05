import { Alert, Flex } from '@backstage/ui';
import {
  CodeBlock,
  TechnicalDetailsFoldOut,
} from '@giantswarm/backstage-plugin-ui-react';
import { ssoRefusedText } from '../../shared';

export interface ConnectorCannotConnectProps {
  /** What people call the connector: its display name. */
  displayName: string;
  /**
   * muster's account of the refused attempt (`auth://status` `error`): the
   * connect error and the forwarded token's issuer and audiences, which is
   * what an administrator needs to fix the trusted audiences.
   */
  error?: string;
}

/**
 * The Tools tab's state, in place of the sign-in gate, for an SSO connector
 * that refused the person's sign-in (`isSsoRefused`): nothing to sign in to,
 * so no button, and muster's own reason folded under Details to copy for an
 * administrator.
 */
export function ConnectorCannotConnect({
  displayName,
  error,
}: ConnectorCannotConnectProps) {
  return (
    <Flex direction="column" gap="3">
      <Alert
        status="danger"
        title={`${displayName} cannot connect for you`}
        description={ssoRefusedText(displayName, 'connector')}
      />
      {error ? (
        <TechnicalDetailsFoldOut defaultExpanded={false} title="Details">
          <CodeBlock text={error} />
        </TechnicalDetailsFoldOut>
      ) : null}
    </Flex>
  );
}
