import { useState } from 'react';
import { Button } from '@backstage/ui';
import { McpAuthDialog } from '../McpAuthDialog';
import {
  SignInStatusActions,
  useServerSignInStatus,
  type StatusText,
} from '../shared';

export type FamilySignInProps = {
  installation: string;
  /** What people call the family. */
  displayName: string;
  /** The members waiting for the person's sign-in, by muster name. */
  waiting: string[];
  /** The family's state, shown while no sign-in from this tab overrides it. */
  status: StatusText;
  /** Let the button label wrap where its cell is narrow. */
  wrap?: boolean;
};

function MemberSignIn({
  serverName,
  displayName,
  installation,
  status,
  wrap,
}: Omit<FamilySignInProps, 'waiting'> & { serverName: string }) {
  const signInStatus = useServerSignInStatus({
    noun: 'connector',
    serverName,
    displayName,
    installation,
    status,
  });
  return <SignInStatusActions signInStatus={signInStatus} wrap={wrap} />;
}

/**
 * One sign-in for a family: the member's own sign-in where one member waits,
 * else the sign-in dialog listing the waiting members. Members on one issuer
 * connect together, as muster adopts a grant across them.
 */
export function FamilySignIn({
  installation,
  displayName,
  waiting,
  status,
  wrap,
}: FamilySignInProps) {
  const [isOpen, setOpen] = useState(false);
  if (waiting.length === 0) {
    return null;
  }
  if (waiting.length === 1) {
    return (
      <MemberSignIn
        serverName={waiting[0]}
        displayName={displayName}
        installation={installation}
        status={status}
        wrap={wrap}
      />
    );
  }
  return (
    <>
      <Button variant="primary" size="small" onPress={() => setOpen(true)}>
        Sign in
      </Button>
      <McpAuthDialog
        isOpen={isOpen}
        onOpenChange={setOpen}
        installation={installation}
        servers={waiting}
      />
    </>
  );
}
