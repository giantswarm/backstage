import { InfoHint } from '@giantswarm/backstage-plugin-ui-react';

import { ownerOf, PLATFORM_TENANT_NAMESPACE } from '../../lib/tenants';

/** What an agent owned by the platform means. */
export const PLATFORM_OWNER_HINT = 'Available to all organizations';

export type OwnerValueProps = {
  /** The agent's namespace. */
  namespace: string;
  className?: string;
};

/**
 * Who an agent belongs to, as a value under the label "Owner": the
 * organization's plain name, or, for an agent of the platform, which is no
 * organization, "Platform" with an info icon that says it is available to
 * all of them. The icon is a button (`InfoHint`): its tooltip shows on hover
 * and keyboard focus, and a press opens the same text.
 */
export function OwnerValue({ namespace, className }: OwnerValueProps) {
  if (namespace !== PLATFORM_TENANT_NAMESPACE) {
    return <span className={className}>{ownerOf(namespace)}</span>;
  }
  return (
    <span className={className}>
      {ownerOf(namespace)}{' '}
      <InfoHint label="What Platform means" size="medium">
        {PLATFORM_OWNER_HINT}
      </InfoHint>
    </span>
  );
}
