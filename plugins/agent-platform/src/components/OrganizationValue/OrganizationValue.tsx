import { InfoHint } from '@giantswarm/backstage-plugin-ui-react';

import { PLATFORM_TENANT_NAMESPACE, tenantOf } from '../../lib/tenants';

/** What an agent of the platform's "None" means. */
export const NO_ORGANIZATION_HINT = 'Available to all organizations';

export type OrganizationValueProps = {
  /** The agent's namespace. */
  namespace: string;
  className?: string;
};

/**
 * The organization an agent belongs to, as a value under the label
 * "Organization": its plain name, or, for an agent of the platform, which
 * belongs to no organization, "None" with an info icon that says it is
 * available to all of them. The icon is a button (`InfoHint`): its tooltip
 * shows on hover and keyboard focus, and a press opens the same text.
 */
export function OrganizationValue({
  namespace,
  className,
}: OrganizationValueProps) {
  if (namespace !== PLATFORM_TENANT_NAMESPACE) {
    return <span className={className}>{tenantOf(namespace)}</span>;
  }
  return (
    <span className={className}>
      {tenantOf(namespace)}{' '}
      <InfoHint label="What None means" size="medium">
        {NO_ORGANIZATION_HINT}
      </InfoHint>
    </span>
  );
}
